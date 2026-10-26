import { MS_DAY, HOUR, tsOf } from "../chem/time.js";
import { ADDITIVES } from "../chem/additives.js";
import { applyDose, phEquilibrium, outgasPH } from "../chem/carbonate.js";

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
  // Per interval between consecutive pH readings: start from the earlier pH, push the
  // alkalinity/CYA changes of any doses in (prev, cur] through the carbonate system,
  // then solve for the outgassing rate kg (1/day) that carries dissolved CO2 from that
  // start to the observed end pH over the elapsed days, at constant alkalinity.
  const msSorted = measurements.slice().sort((a, b) => tsOf(a) - tsOf(b));
  const phMs = msSorted.filter(m => m.ph != null);
  let kSamples = [], phIntervals = 0;
  const lastKnown = (key, t) => { let v = null; for (const m of msSorted) { if (tsOf(m) > t) break; if (m[key] != null && m[key] !== "") v = Number(m[key]); } return v; };
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
    const phStart = st.ph, phEnd = Number(phMs[i].ph), days = hours / 24;
    const eq = phEqOverride != null ? phEqOverride : phEquilibrium(st.ta, st.cya || 0, st.temp, st.ch);
    if (eq == null) continue;
    const dS = eq - phStart, dE = eq - phEnd;
    // usable only when start and end sit on the same side of equilibrium and the end is closer
    if (!(dS * dE > 0) || Math.abs(dE) > Math.abs(dS) || Math.abs(dS) < 0.03) continue;
    const sgn = dS > 0 ? 1 : -1; // below equilibrium pH rises with kg; above, it falls
    const g = kg => sgn * (outgasPH(phStart, st.ta, st.cya || 0, days, kg, st.temp, st.ch, phEqOverride) - phEnd);
    let lo = 0, hi = 6;
    if (g(hi) < 0) continue; // not reproducible at any rate (e.g. a reading logged before a same-day dose); skip rather than bias k
    for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (g(mid) < 0) lo = mid; else hi = mid; }
    const kg = (lo + hi) / 2;
    if (isFinite(kg) && kg >= 0) { kSamples.push(kg); phIntervals++; }
  }
  const dynPhK = kSamples.length ? Math.max(0, Math.min(6, kSamples.reduce((a, b) => a + b, 0) / kSamples.length)) : null;
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

