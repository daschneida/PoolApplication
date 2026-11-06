import { MS_DAY, HOUR } from "../chem/time.js";
import { ADDITIVES, CL_CHEM, ACID_CHEM, CL_STEPS, acidStepsFor, acidDefaultFor } from "../chem/additives.js";
import { csi } from "../chem/csi.js";
import { sunDays } from "../chem/sun.js";
import { applyDose, outgasPH } from "../chem/carbonate.js";
import { fmt, fmtVal } from "../util.js";

/* ===================== ADVICE ENGINE ===================== */
// Enumerate container-sized dose plans, simulate each over the next few days with the same
// FC sun-day decay and carbonate chemistry the chart uses, and score the trajectory.
// Weights are per sample point (6-hour steps), squared distance outside each target range:
// the FC floor (1 ppm) and pH/CSI dominate; overshooting FC costs little (user accepts it);
// long-term parameters count a little so trichlor or cal-hypo win when CYA or CH are low.
export function simulatePlan(st0, doses, P) {
  let st = { ...st0 };
  doses.forEach(d => { st = applyDose(st, d.chem, d.oz, P.V); });
  const out = [{ ...st, h: 0, csi: csi(st.ph, st.ch, st.ta, st.cya, st0.temp) }];
  const stepH = 6;
  let t = P.now;
  for (let hr = stepH; hr <= P.days * 24; hr += stepH) {
    const t1 = t + stepH * HOUR;
    if (st.fc != null) st.fc = Math.max(0, st.fc * Math.pow(1 - P.frac, sunDays(t, t1, P.sunStart, P.sunEnd)));
    if (st.ph != null) st.ph = st.ta != null && st.ta > 0 ? outgasPH(st.ph, st.ta, st.cya || 0, stepH / 24, P.k, st.temp, st.ch, P.phEqOverride) : P.phEq - (P.phEq - st.ph) * Math.exp(-P.k * stepH / 24);
    t = t1;
    out.push({ ...st, h: hr, csi: csi(st.ph, st.ch, st.ta, st.cya, st0.temp) });
  }
  return out;
}
const sq = x => x * x;
export function scorePlan(pts, doses, R, acidDefault) {
  let pen = 0;
  for (const p of pts) {
    if (p.fc != null) pen += 60 * sq(Math.max(0, 1 - p.fc)) + 8 * sq(Math.max(0, R.fcLo - p.fc)) + 0.25 * sq(Math.max(0, p.fc - R.fcHi));
    if (p.ph != null) pen += 120 * sq(Math.max(0, R.phLo - p.ph)) + 80 * sq(Math.max(0, p.ph - R.phHi));
    if (p.csi != null) pen += 60 * sq(Math.max(0, R.csiLo - p.csi)) + 40 * sq(Math.max(0, p.csi - R.csiHi));
    if (p.cya != null) pen += 0.004 * (sq(Math.max(0, R.cyaLo - p.cya)) + sq(Math.max(0, p.cya - R.cyaHi)));
    if (p.ta != null) pen += 0.002 * (sq(Math.max(0, R.taLo - p.ta)) + sq(Math.max(0, p.ta - R.taHi)));
    if (p.ch != null) pen += 0.0004 * (sq(Math.max(0, R.chLo - p.ch)) + sq(Math.max(0, p.ch - R.chHi)));
  }
  pen /= pts.length;
  pen += 0.12 * doses.length; // every intervention costs a little
  const acid = doses.find(d => d.chem === ACID_CHEM);
  if (acid && acid.oz !== acidDefault) pen += 0.25; // prefer the user's standard acid dose unless another step is clearly better
  return pen;
}
export function summarizePts(pts) {
  const vals = k => pts.map(p => p[k]).filter(v => v != null);
  const mm = k => { const v = vals(k); return v.length ? [Math.min(...v), Math.max(...v)] : null; };
  const fc = mm("fc"), ph = mm("ph"), cs = mm("csi");
  const hoursUnder = pts.filter(p => p.fc != null && p.fc < 1).length * 6;
  return { fc, ph, csi: cs, hoursUnder, end: pts[pts.length - 1] };
}
export function summaryLine(sm) {
  const parts = [];
  if (sm.fc) parts.push(`FC ${fmt(sm.fc[0])}–${fmt(sm.fc[1])} ppm${sm.hoursUnder ? ` (${sm.hoursUnder} h under 1 ppm)` : ""}`);
  if (sm.ph) parts.push(`pH ${fmt(sm.ph[0], 2)}–${fmt(sm.ph[1], 2)}`);
  if (sm.csi) parts.push(`CSI ${fmtVal("csi", sm.csi[0])} to ${fmtVal("csi", sm.csi[1])}`);
  return parts.join(", ");
}
export const doseLabel = d => `${d.oz} ${ADDITIVES[d.chem].unit} ${d.chem}`;

  // ===================== DOSING PLAN (container-sized) =====================
  // Chlorine: NaOCl in fixed pour increments (default 64 fl oz). Suggested whenever FC is below the low bound now or the
  // forecast crosses it inside the chart window. Overshoot inside/above range is accepted.
  // Acid: suggested only while pH is above the range high. Fixed container steps, hard cap.
export function computePlan({ latest, series, config }) {
  const num = (v, d) => v === "" || v == null || isNaN(v) ? d : Number(v);
  const out = {
    cl: null,
    acid: null,
    fcLo: num(config.fcLo, 2),
    fcHi: num(config.fcHi, 6),
    phLo: num(config.phLo, 7.4),
    phHi: num(config.phHi, 7.8)
  };
  if (!latest) return out;
  const V = num(config.volume, 19000);
  const jug = Math.max(1, num(config.clStepOz, 64));
  if (latest.fc != null) {
    let crossing = null;
    if (latest.fc < out.fcLo) crossing = { days: 0, date: latest.date };
    else for (const s of series) {
      if (s._future && s.fc != null && s.fc < out.fcLo) {
        crossing = { days: Math.max(0, Math.round((s.t - latest.t) / MS_DAY)), date: s.date };
        break;
      }
    }
    // Dose rule: the fewest pours that put FC at or just over the top of the target range.
    const perPour = ADDITIVES[CL_CHEM].Cl * jug / V;
    const pours = Math.max(1, Math.ceil((out.fcHi - latest.fc) / perPour - 1e-9));
    if (crossing) out.cl = { chem: CL_CHEM, step: jug, defaultOz: pours * jug, pours, perOz: ADDITIVES[CL_CHEM].Cl / V, crossing };
  }
  if (latest.ph != null && latest.ph > out.phHi) {
    const a = ADDITIVES[ACID_CHEM];
    out.acid = {
      chem: ACID_CHEM,
      steps: acidStepsFor(config),
      defaultOz: acidDefaultFor(config),
      phPerOz: a.pH / V,
      taPerOz: a.TA / V
    };
  }
  return out;
}

// The best container-sized plan over the forecast horizon, by simulation and scoring.
export function computeAdvice({ latest, plan, config, effFrac, effPhK, effPhEq, phEqOverride, lastTemp }) {
  if (!latest) return null;
  const n = (v, d) => v === "" || v == null || isNaN(v) ? d : Number(v);
  const R = { fcLo: plan.fcLo, fcHi: plan.fcHi, phLo: plan.phLo, phHi: plan.phHi, csiLo: n(config.csiLo, -0.3), csiHi: n(config.csiHi, 0.3),
    cyaLo: n(config.cyaLo, 40), cyaHi: n(config.cyaHi, 60), taLo: n(config.taLo, 80), taHi: n(config.taHi, 120), chLo: n(config.chLo, 200), chHi: n(config.chHi, 400) };
  const V = n(config.volume, 19000), jug = Math.max(1, n(config.clStepOz, 64));
  const days = Math.max(3, Math.min(7, n(config.chartDaysFwd, 7)));
  const st0 = { fc: latest.fc, ph: latest.ph, cya: latest.cya, ta: latest.ta, ch: latest.ch, temp: lastTemp };
  const P = { V, now: Date.now(), days, frac: effFrac, k: effPhK, phEq: effPhEq, phEqOverride, sunStart: config.sunStart, sunEnd: config.sunEnd };
  const cl = [{ chem: null, oz: 0 }];
  if (latest.fc != null) {
    // Chlorine is dosed to the top of the range, not optimized over the horizon: the one
    // candidate per source is the smallest amount that lands FC at or just over fcHi.
    const toTop = (chem, stepsOrNull) => {
      const per = ADDITIVES[chem].Cl / V;
      const need = Math.max(0, R.fcHi - latest.fc);
      if (stepsOrNull) { const hit = stepsOrNull.find(oz => oz * per >= need - 1e-9); return hit != null ? hit : stepsOrNull[stepsOrNull.length - 1]; }
      return Math.max(1, Math.ceil(need / (per * jug) - 1e-9)) * jug;
    };
    cl.push({ chem: CL_CHEM, oz: toTop(CL_CHEM, null) });
    if (latest.cya != null && latest.cya < R.cyaLo) cl.push({ chem: "Trichlor", oz: toTop("Trichlor", CL_STEPS["Trichlor"]) });
    if (latest.ch != null && latest.ch < R.chLo) cl.push({ chem: "Ca(OCl)2 (73 wt%)", oz: toTop("Ca(OCl)2 (73 wt%)", CL_STEPS["Ca(OCl)2 (73 wt%)"]) });
  }
  const acid = [0]; if (plan.acid) acid.push(...plan.acid.steps); // acid only while pH is above the ceiling (house rule)
  const bicarb = [0]; if (latest.ta != null && latest.ta < R.taLo && latest.ph != null) bicarb.push(16, 32, 48);
  const cacl = [0]; if (latest.ch != null && latest.ch < R.chLo) cacl.push(32, 64, 128);
  const acidDefault = acidDefaultFor(config);
  const plans = [];
  for (const c of cl) for (const a of acid) for (const b of bicarb) for (const cc of cacl) {
    const doses = [];
    if (c.chem) doses.push({ chem: c.chem, oz: c.oz });
    if (a) doses.push({ chem: ACID_CHEM, oz: a });
    if (b) doses.push({ chem: "Sodium Bicarbonate", oz: b });
    if (cc) doses.push({ chem: "Calcium Chloride", oz: cc });
    const pts = simulatePlan(st0, doses, P);
    plans.push({ doses, pts, score: scorePlan(pts, doses, R, acidDefault), summary: summarizePts(pts), key: `${c.chem}|${c.oz}|${a}` });
  }
  plans.sort((x, y) => x.score - y.score);
  const best = plans[0];
  return { best, alt: plans.find(q => q.key !== best.key) || null, none: plans.find(q => q.doses.length === 0) || null, days, count: plans.length, R };
}

