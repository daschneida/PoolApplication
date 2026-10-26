import { MS_DAY, HOUR, tsOf } from "../chem/time.js";
import { ADDITIVES } from "../chem/additives.js";
import { applyDose, outgasPH } from "../chem/carbonate.js";

// Calibration from the owner's own readings: FC loss over the window and the CO2 outgassing rate.
export function computeLearned({ measurements, doses, config, effPhEq, phEqOverride }) {
  const win = config.lossWindow === "" || config.lossWindow == null || isNaN(config.lossWindow) ? 14 : Number(config.lossWindow);
  const cutoff = Date.now() - win * MS_DAY;
  const phEq = effPhEq;

  // ============== CHLORINE (FC) ==============
  const fcMs = measurements.filter(m => m.fc != null).slice().sort((a, b) => tsOf(a) - tsOf(b));
  const fcWin = fcMs.filter(m => tsOf(m) >= cutoff);
  let totalLoss = null,
    spanDays = 0,
    nReadings = 0,
    dynFrac = null,
    avgFC = null;
  if (fcWin.length >= 2) {
    const first = fcWin[0],
      last = fcWin[fcWin.length - 1];
    const tA = tsOf(first),
      tB = tsOf(last);
    const hours = (tB - tA) / HOUR;
    if (hours > 0) {
      const spanDoses = doses.filter(d => {
        const t = tsOf(d);
        return t >= tA && t <= tB;
      });
      const dosed = spanDoses.reduce((s, d) => s + (ADDITIVES[d.chem]?.Cl || 0) * d.oz / config.volume, 0);
      const loss = first.fc + dosed - last.fc;
      spanDays = hours / 24;
      totalLoss = loss / spanDays;
      nReadings = fcWin.length;
      // average FC via non-circular anchor-and-glide reconstruction
      const dayMs = MS_DAY;
      const dayDose = {};
      const anchor = {};
      spanDoses.forEach(d => {
        const k = Math.floor((tsOf(d) - tA) / dayMs);
        dayDose[k] = (dayDose[k] || 0) + (ADDITIVES[d.chem]?.Cl || 0) * d.oz / config.volume;
      });
      fcWin.forEach(m => {
        const k = Math.round((tsOf(m) - tA) / dayMs);
        anchor[k] = m.fc;
      });
      const totalDaysI = Math.max(1, Math.round(spanDays));
      let lvl = first.fc;
      let levels = [];
      for (let k = 0; k <= totalDaysI; k++) {
        if (anchor[k] != null) lvl = anchor[k];
        if (dayDose[k]) lvl += dayDose[k];
        levels.push(Math.max(0, lvl));
        let nextK = null;
        for (let j = k + 1; j <= totalDaysI; j++) {
          if (anchor[j] != null) {
            nextK = j;
            break;
          }
        }
        if (nextK != null) {
          const steps = nextK - k;
          if (steps > 0) lvl += (anchor[nextK] - lvl) / steps;
        }
      }
      avgFC = levels.reduce((a, b) => a + b, 0) / levels.length;
      if (avgFC > 0 && totalLoss > 0) {
        dynFrac = Math.max(0, Math.min(0.95, totalLoss / avgFC));
      }
    }
  }

  // ============== pH DRIFT (CO2 outgassing rate) ==============
  // One outgassing rate kg (1/day) is fitted jointly to every interval between consecutive
  // pH readings in the window. For each interval the start pH has the doses in (prev, cur]
  // pushed through the carbonate system; the model then predicts the end pH for a given kg
  // and the fit minimizes the mismatch. Two realities of a drop-test kit are built in:
  //   - readings are quantized (0.2 steps on most kits), so a residual inside half a step
  //     (PH_RES/2) counts as zero: an unchanged reading does not force kg toward zero, it
  //     only says kg is below whatever would have moved the reading a full step;
  //   - the occasional reading that is logged before a same-day dose produces a residual no
  //     rate can explain, so residuals beyond the deadband are penalized linearly (Huber),
  //     not squared, and cannot dominate the fit.
  // If the data cannot tell kg = 0 from kg = 2 (every interval sits inside the deadband),
  // the result is null and the Settings fallback is used.
  const PH_RES = 0.2;
  const msSorted = measurements.slice().sort((a, b) => tsOf(a) - tsOf(b));
  const phMs = msSorted.filter(m => m.ph != null);
  const lastKnown = (key, t) => { let v = null; for (const m of msSorted) { if (tsOf(m) > t) break; if (m[key] != null && m[key] !== "") v = Number(m[key]); } return v; };
  const intervals = [];
  for (let i = 1; i < phMs.length; i++) {
    const tPrev = tsOf(phMs[i - 1]), tCur = tsOf(phMs[i]);
    const hours = (tCur - tPrev) / HOUR;
    if (!(hours > 0) || hours > 21 * 24) continue;
    if (tCur < cutoff) continue; // interval ends before the window
    const ta0 = phMs[i - 1].ta != null ? Number(phMs[i - 1].ta) : lastKnown("ta", tPrev);
    const cya0 = phMs[i - 1].cya != null ? Number(phMs[i - 1].cya) : lastKnown("cya", tPrev);
    const ch0 = phMs[i - 1].ch != null ? Number(phMs[i - 1].ch) : lastKnown("ch", tPrev);
    const t0 = phMs[i - 1].temp != null ? Number(phMs[i - 1].temp) : (lastKnown("temp", tPrev) ?? (Number(config.temp) || 85));
    let st = { fc: null, ph: Number(phMs[i - 1].ph), cya: cya0, ta: ta0, ch: ch0, temp: t0 };
    doses.filter(d => { const t = tsOf(d); return t > tPrev && t <= tCur; }).sort((a, b) => tsOf(a) - tsOf(b)).forEach(d => { st = applyDose(st, d.chem, d.oz, config.volume); });
    if (st.ta == null || !(st.ta > 0)) continue; // carbonate model needs an alkalinity reading
    intervals.push({ phStart: st.ph, phEnd: Number(phMs[i].ph), days: hours / 24, ta: st.ta, cya: st.cya || 0, ch: st.ch, temp: st.temp });
  }
  const phIntervals = intervals.length;
  let dynPhK = null;
  if (intervals.length >= 2) {
    const half = PH_RES / 2;
    const loss = kg => intervals.reduce((acc, iv) => {
      const r = Math.abs(outgasPH(iv.phStart, iv.ta, iv.cya, iv.days, kg, iv.temp, iv.ch, phEqOverride) - iv.phEnd);
      const e = Math.max(0, r - half);           // deadband: inside half a kit step is a perfect fit
      return acc + (e <= PH_RES ? e * e : PH_RES * (2 * e - PH_RES)); // Huber beyond one step
    }, 0);
    // scan kg on a log grid from 0.01 to 6 (plus 0), then take the midpoint of the flat optimum
    const grid = [0];
    for (let g = Math.log(0.01); g <= Math.log(6) + 1e-9; g += (Math.log(6) - Math.log(0.01)) / 80) grid.push(Math.exp(g));
    const L = grid.map(loss);
    const minL = Math.min(...L);
    const flat = grid.filter((_, i) => L[i] <= minL + 1e-9);
    const kLo = flat[0], kHi = flat[flat.length - 1];
    if (!(kLo <= 0.011 && kHi >= 2)) {
      // informative: geometric midpoint of the optimum band (arithmetic if it touches zero)
      dynPhK = kLo > 0 ? Math.sqrt(kLo * kHi) : kHi / 2;
      dynPhK = Math.max(0, Math.min(6, dynPhK));
    }
  }
  if (totalLoss == null && dynPhK == null) return null;
  return {
    totalLoss,
    n: nReadings,
    spanDays,
    win,
    frac: dynFrac,
    avgFC,
    phK: dynPhK,
    phIntervals,
    phEq
  };
}

