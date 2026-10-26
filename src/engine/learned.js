import { MS_DAY, HOUR, tsOf } from "../chem/time.js";
import { ADDITIVES } from "../chem/additives.js";
import { applyDose, outgasPH, phEquilibrium } from "../chem/carbonate.js";

// Calibration from the owner's own readings: FC loss over the window and the CO2 outgassing rate.
export function computeLearned({ measurements, doses, config, effPhEq, phEqOverride }) {
  // phEqOverride here is the MANUAL override only; a fitted equilibrium comes out of this function
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

  // ============== pH DRIFT: outgassing rate AND effective equilibrium ==============
  // Two things are fitted jointly to every interval between consecutive pH readings in the
  // window: the CO2 outgassing rate kg (1/day) and the effective equilibrium pH. They are
  // identified by different data: a plateau (pH sitting at 7.8 for days) pins the equilibrium,
  // while the climb after an acid dose pins the rate. Fitting only kg would read a plateau as
  // "no outgassing" and then forecast no recovery after acid, which is wrong: the CO2 excess
  // at pH 7.2 is ten times larger than at 7.8.
  // The equilibrium is searched from 7.5 up to the atmospheric prediction (never above it:
  // covers, bather CO2 and weak aeration only ever pull it down), with a mild prior toward the
  // prediction, and kg on a log grid with a mild prior toward a typical 0.3/day.
  // Drop-test-kit realities: residuals inside half a kit step (PH_RES/2) count as zero, and
  // residuals beyond one step are penalized linearly (Huber), so an unchanged reading never
  // forces kg to zero and a reading logged before a same-day dose cannot dominate.
  // When a manual equilibrium override is set, only kg is fitted against it.
  const PH_RES = 0.2;
  const msSorted = measurements.slice().sort((a, b) => tsOf(a) - tsOf(b));
  const phMs = msSorted.filter(m => m.ph != null && m.ph !== "" && isFinite(Number(m.ph)));
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
  let dynPhK = null, phEqFit = null;
  if (intervals.length >= 2) {
    const half = PH_RES / 2;
    const last = intervals[intervals.length - 1];
    const eqPred = phEquilibrium(last.ta, last.cya, last.temp, last.ch);
    const misfit = (kg, eq) => intervals.reduce((acc, iv) => {
      const r = Math.abs(outgasPH(iv.phStart, iv.ta, iv.cya, iv.days, kg, iv.temp, iv.ch, eq) - iv.phEnd);
      const e = Math.max(0, r - half);
      return acc + (e <= PH_RES ? e * e : PH_RES * (2 * e - PH_RES));
    }, 0);
    const K_PRIOR = 0.3, K_W = 0.004, EQ_W = 0.15;
    const kGrid = [];
    for (let g = Math.log(0.01); g <= Math.log(6) + 1e-9; g += (Math.log(6) - Math.log(0.01)) / 40) kGrid.push(Math.exp(g));
    const eqGrid = [];
    if (phEqOverride != null) eqGrid.push(phEqOverride);
    else if (eqPred != null) for (let e = 7.5; e <= eqPred + 1e-9; e += 0.05) eqGrid.push(Math.min(e, eqPred));
    if (eqGrid[eqGrid.length - 1] !== eqPred && phEqOverride == null && eqPred != null) eqGrid.push(eqPred);
    let best = null;
    for (const eq of eqGrid) for (const kg of kGrid) {
      const L = misfit(kg, eq) + K_W * Math.pow(Math.log(kg / K_PRIOR), 2) + (phEqOverride == null ? EQ_W * Math.pow(eq - eqPred, 2) : 0);
      if (Number.isFinite(L) && (best == null || L < best.L)) best = { L, kg, eq };
    }
    if (best) {
      dynPhK = Math.max(0, Math.min(6, best.kg));
      if (phEqOverride == null && Math.abs(best.eq - eqPred) > 0.025) phEqFit = best.eq;
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
    phEqFit,
    phIntervals,
    phEq
  };
}

