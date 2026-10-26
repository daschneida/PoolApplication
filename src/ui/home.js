import { h, useState, useEffect, React } from "./react.js";
import { C, colorOf, statusOf, daysPhrase } from "./theme.js";
import { Card, CardHead, Chip } from "./pieces.js";
import { MiniChart } from "./charts.js";
import { DoseBox } from "./dosebox.js";
import { ADDITIVES, PARAMS, CL_CHEM, ACID_CHEM, CL_STEPS } from "../chem/additives.js";
import { MS_DAY } from "../chem/time.js";
import { phForCSI } from "../chem/csi.js";
import { fmt, fmtVal, numOrDef, rangeOf } from "../util.js";
import { summaryLine, doseLabel } from "../engine/planner.js";

/* ===================== HOME ===================== */
export function Home({ config, latest, series, forecast, learned, effFrac, effPhK, effPhEq, effPhEqInfo, plan, advice, effectOf, logDoseNow, curTemp, lastMeasTs, setTab, setFocus }) {
  const fcR = rangeOf(config, "fc"), phR = rangeOf(config, "ph"), csiR = rangeOf(config, "csi");
  // The planner's picks seed the steppers; the crossing rule and the pH ceiling decide
  // whether a box is shown at all, so a box can appear with the planner advising to wait.
  const jug = Math.max(1, numOrDef(config.clStepOz, 64));
  const bestCl = advice ? advice.best.doses.find(d => ADDITIVES[d.chem].Cl > 0) || null : null;
  const bestAcid = advice ? advice.best.doses.find(d => d.chem === ACID_CHEM) || null : null;
  const clChem = bestCl ? bestCl.chem : CL_CHEM;
  const clSeed = bestCl ? bestCl.oz : plan.cl ? plan.cl.defaultOz : jug;
  const [clOz, setClOz] = useState(clSeed);
  const [acidOz, setAcidOz] = useState(bestAcid ? bestAcid.oz : plan.acid ? plan.acid.defaultOz : 43);
  useEffect(() => { setClOz(clSeed); }, [clSeed, bestCl && bestCl.chem]);
  useEffect(() => { setAcidOz(bestAcid ? bestAcid.oz : plan.acid ? plan.acid.defaultOz : 43); }, [bestAcid && bestAcid.oz, plan.acid && plan.acid.defaultOz]);
  const showCl = !!(plan.cl || bestCl);
  const planLine = advice ? `Planner, ${advice.days} days: ${advice.best.doses.length ? advice.best.doses.map(doseLabel).join(" + ") : "add nothing"} → ${summaryLine(advice.best.summary)}.` : null;

  if (!latest) return h("div", { className: "page" },
    h(Card, null, h(CardHead, { title: "No readings yet" }), h("p", { className: "p" }, "Log a measurement to start the model."),
      h("button", { type: "button", className: "btn-primary", onClick: () => setTab("log") }, "Log a reading")));

  // trend words from the model one day out
  const dayOut = series.find(s => s.t >= latest.t + MS_DAY * 0.9 && s._future) || null;
  const trend = (key, up, down) => {
    if (!dayOut || dayOut[key] == null || latest[key] == null) return "";
    const d = dayOut[key] - latest[key];
    const eps = key === "ph" ? 0.03 : 0.2;
    return d > eps ? up : d < -eps ? down : "steady";
  };

  // reminder
  const reminder = (() => {
    if (lastMeasTs == null) return null;
    const ds = (Date.now() - lastMeasTs) / MS_DAY;
    if (ds < 3) return null;
    const urgent = ds >= 5;
    return h("div", { className: "banner" },
      h("span", { className: "sq", style: { background: urgent ? C.red : C.gold } }),
      h("span", null, urgent ? `${Math.floor(ds)} days since your last reading. The forecast is getting stale; log one today.` : `Last reading ${Math.floor(ds)} days ago. Log one to keep the forecast tight.`));
  })();

  const fcS = statusOf(latest.fc, fcR.lo, fcR.hi);
  const phS = statusOf(latest.ph, phR.lo, phR.hi);
  const fcTrend = trend("fc", "rising", "falling"), phTrend = trend("ph", "rising", "falling");
  const fcChip = { ...fcS, label: fcS.label + (fcTrend ? " · " + fcTrend : "") };
  const phChip = { ...phS, label: phS.label + (phTrend ? " · " + phTrend : "") };

  // loss headline
  const loss = learned && learned.totalLoss != null ? `losing ${fmt(learned.totalLoss)} ppm/day` : `fallback ${fmt(effFrac * 100, 0)}%/day`;
  const halfLife = (() => {
    if (!learned || learned.frac == null) return null;
    const W = Number(config.sunEnd) - Number(config.sunStart);
    if (!(W > 0 && W < 24)) return null;
    const f = Math.max(0, Math.min(0.95, learned.frac));
    if (f <= 0) return null;
    const hl = Math.log(2) / (-Math.log(1 - f) / W);
    return isFinite(hl) ? (hl < 10 ? hl.toFixed(1) : Math.round(hl)) : null;
  })();

  // pH floor for the subtitle
  const phFloor = latest.ta != null && latest.ch != null && latest.cya != null ? phForCSI(csiR.lo, latest.ch, latest.ta, latest.cya, curTemp) : null;

  const clEff = showCl ? effectOf(clChem, clOz) : null;
  const acEff = plan.acid ? effectOf(plan.acid.chem, acidOz) : null;
  const defAcidEff = plan.acid && bestAcid && bestAcid.oz !== plan.acid.defaultOz ? effectOf(plan.acid.chem, plan.acid.defaultOz) : null;

  // CSI
  const csiWord = c => c == null ? "need all five inputs" : c <= -0.6 ? "corrosive" : c <= -0.3 ? "slightly corrosive" : c < 0.3 ? "balanced" : c < 0.6 ? "slightly scaling" : "scaling";
  const csiChip = latest.csi == null ? { label: "no data", bg: C.g100, fg: C.ink }
    : latest.csi >= csiR.lo && latest.csi <= csiR.hi ? { label: "balanced", bg: C.mint, fg: C.green }
    : Math.abs(latest.csi) < 0.6 ? { label: csiWord(latest.csi), bg: C.gold, fg: C.ink }
    : { label: csiWord(latest.csi), bg: C.red, fg: C.white };
  const csiPos = latest.csi == null ? null : Math.max(2, Math.min(98, (latest.csi + 0.75) / 1.5 * 100));

  const fcBelow = forecast && forecast.fcBelow1, phAbove = forecast && forecast.phAbove;

  return h("div", { className: "page" },
    reminder,

    // 1. chlorine
    h(Card, { accent: colorOf("fc") },
      h(CardHead, { title: "Free chlorine", sub: `target ${fcR.lo}–${fcR.hi} ppm`, right: h(Chip, { s: fcChip }) }),
      h("div", { className: "hero-row" },
        h("div", { className: "hero-val" }, h("span", { style: { color: colorOf("fc") } }, fmtVal("fc", latest.fc)), h("span", { className: "unit" }, "ppm")),
        h("div", { className: "hero-side" },
          h("span", null, fcBelow ? h(React.Fragment, null, h("b", null, `Below 1 ppm ${daysPhrase(fcBelow)}`), fcBelow.days > 0 ? ` (${fcBelow.date})` : "") : h("b", null, "Stays above 1 ppm through the forecast")),
          h("span", null, loss, halfLife ? ` · t½ ≈ ${halfLife} h` : ""))),
      h(MiniChart, { series, pkey: "fc", color: colorOf("fc"), lo: fcR.lo, hi: fcR.hi, threshold: 1 }),
      showCl && clEff ? h(DoseBox, {
        title: `Add today · ${clChem}`, chem: clChem, oz: clOz, step: clChem === CL_CHEM ? jug : undefined, steps: CL_STEPS[clChem], onChange: setClOz,
        lines: [`${fmt(latest.fc)} → ${fmt(clEff.fc)} ppm now; about ${fmt(clEff.fc1)} ppm this time tomorrow${clChem !== CL_CHEM && clEff.cya != null && latest.cya != null && clEff.cya !== latest.cya ? ` · CYA ${fmt(latest.cya, 0)} → ${fmt(clEff.cya, 0)}` : ""}${clChem !== CL_CHEM && clEff.ch != null && latest.ch != null && clEff.ch !== latest.ch ? ` · CH ${fmt(latest.ch, 0)} → ${fmt(clEff.ch, 0)}` : ""}.`,
          plan.cl ? (plan.cl.crossing.days > 0 ? `Without it FC crosses ${fcR.lo} ppm ${daysPhrase(plan.cl.crossing)}.` : `FC is already below ${fcR.lo} ppm.`) : null,
          !bestCl ? `The planner would wait: ${summaryLine(advice.none ? advice.none.summary : advice.best.summary)} without chlorine.` : planLine].filter(Boolean),
        note: clChem === CL_CHEM ? `Fewest ${jug} fl oz pours that reach the top of your range (${fcR.hi} ppm). Writes the dose at the current time on tap. Undo from the banner or Log.` : `${clChem} chosen because ${clChem === "Trichlor" ? "CYA" : "calcium"} is below target. Writes on tap.`,
        onLog: () => logDoseNow(clChem, clOz)
      }) : h("div", { className: "allgood" }, `No chlorine called for: FC stays above ${fcR.lo} ppm through the ${config.chartDaysFwd || 7}-day forecast.`)),

    // 2. pH
    h(Card, { accent: colorOf("ph") },
      h(CardHead, { title: "pH", sub: `target ${phR.lo}–${phR.hi}${phFloor != null ? ` · floor ${fmt(phFloor, 2)} (CSI)` : ""}`, right: h(Chip, { s: phChip }) }),
      h("div", { className: "hero-row" },
        h("div", { className: "hero-val" }, h("span", { style: { color: colorOf("ph") } }, fmtVal("ph", latest.ph))),
        h("div", { className: "hero-side" },
          h("span", null, phAbove ? h(React.Fragment, null, h("b", null, `Above ${forecast.phLimit} ${daysPhrase(phAbove)}`), phAbove.days > 0 ? ` (${phAbove.date})` : "") : h("b", null, `Stays at or below ${forecast ? forecast.phLimit : 7.9}`)),
          h("span", null, `outgassing toward pH ${fmt(effPhEq, 2)} · k = ${fmt(effPhK, 2)}/day`))),
      h(MiniChart, { series, pkey: "ph", color: colorOf("ph"), lo: phR.lo, hi: phR.hi, threshold: forecast ? forecast.phLimit : 7.9 }),
      plan.acid && acEff ? h(DoseBox, {
        title: `Add today · ${plan.acid.chem}`, chem: plan.acid.chem, oz: acidOz, steps: plan.acid.steps, onChange: setAcidOz,
        lines: [`pH ${fmt(latest.ph, 2)} → ${fmt(acEff.ph, 2)}${acEff.ta != null ? ` · TA ${fmt(latest.ta, 0)} → ${fmt(acEff.ta, 0)}` : ""}${acEff.csiNow != null ? ` · CSI ${fmtVal("csi", latest.csi)} → ${fmtVal("csi", acEff.csiNow)}` : ""} at dosing.`,
          `Then drift brings pH to ${fmt(acEff.ph1, 2)} by this time tomorrow${acEff.csi1 != null ? ` (CSI ${fmtVal("csi", acEff.csi1)})` : ""}.`,
          phFloor != null && acEff.ph != null && acEff.ph < phFloor ? `Lands ${fmt(phFloor - acEff.ph, 2)} under the CSI floor briefly.` : null,
          !bestAcid && advice ? `The planner would wait: ${summaryLine(advice.none ? advice.none.summary : advice.best.summary)} without acid.` : null,
          bestAcid && bestAcid.oz !== plan.acid.defaultOz && defAcidEff ? `Planner picks ${bestAcid.oz} over your usual ${plan.acid.defaultOz}: at ${plan.acid.defaultOz} fl oz pH would sit at ${fmt(defAcidEff.ph, 2)} now and ${fmt(defAcidEff.ph1, 2)} tomorrow (CSI ${fmtVal("csi", defAcidEff.csi1)}). Step up if you prefer.` : null].filter(Boolean),
        note: `Shown only while pH is above ${phR.hi}. Steps ${plan.acid.steps.join(" · ")} fl oz; ${plan.acid.steps[plan.acid.steps.length - 1]} is the cap per dose. Writes on tap.`,
        onLog: () => logDoseNow(plan.acid.chem, acidOz)
      }) : h("div", { className: "allgood" }, latest.ph == null ? "No pH reading yet." : `No acid called for while pH is at or below ${phR.hi}.`)),

    // 3. CSI
    h(Card, { accent: colorOf("csi") },
      h(CardHead, { title: "Water balance (CSI)", sub: `target ${fmtVal("csi", csiR.lo)} to ${fmtVal("csi", csiR.hi)} · at ${fmt(curTemp, 0)} °F`, right: h(Chip, { s: csiChip }) }),
      h("div", { className: "hero-row", style: { alignItems: "baseline" } },
        h("div", { className: "hero-val mid" }, h("span", { style: { color: colorOf("csi") } }, fmtVal("csi", latest.csi))),
        h("div", { className: "hero-side", style: { textAlign: "left", alignItems: "flex-start" } },
          h("span", null, latest.csi == null ? "Need FC-independent inputs: pH, TA, CH, CYA and a temperature."
            : plan.acid && acEff && acEff.csiNow != null ? `Driven by pH; ${acidOz} fl oz of acid takes it to ${fmtVal("csi", acEff.csiNow)}, back to ${fmtVal("csi", acEff.csi1)} within a day.`
            : latest.csi > csiR.hi ? "Scale-forming: lower pH or alkalinity." : latest.csi < csiR.lo ? "Corrosive: raise pH, alkalinity or calcium." : "Plaster is neither dissolving nor scaling."))),
      h("div", { className: "gauge" },
        h("div", { style: { background: C.red } }), h("div", { style: { background: C.gold } }), h("div", { style: { background: C.mint } }), h("div", { style: { background: C.gold } }), h("div", { style: { background: C.red } }),
        csiPos != null ? h("div", { className: "gauge-pin", style: { left: `${csiPos}%` } }) : null),
      h("div", { className: "gauge-axis" }, h("span", null, "−0.6"), h("span", null, "−0.3"), h("span", null, "0"), h("span", null, "+0.3"), h("span", null, "+0.6"))),

    // 4. long-term
    h("section", { className: "lt" },
      h("div", { className: "lt-head" }, h("h2", { className: "card-title" }, "Long-term"), h("span", null, "carry forward between tests · re-test monthly")),
      h("div", { className: "lt-grid" }, ["cya", "ta", "ch"].map(k => {
        const r = rangeOf(config, k), v = latest[k], s = statusOf(v, r.lo, r.hi);
        const p = PARAMS.find(x => x.key === k);
        return h("button", { key: k, type: "button", className: "lt-card", onClick: () => { setFocus(k); setTab("trends"); } },
          h("span", { className: "lt-k" }, k === "cya" ? "CYA" : k === "ta" ? "Alkalinity" : "Calcium"),
          h("span", { className: "lt-v" }, h("span", { style: { color: p.color } }, fmtVal(k, v)), h("span", { className: "unit" }, "ppm")),
          h("span", { className: "lt-s" }, `${r.lo}–${r.hi} · ${s.label === "in range" ? "ok" : s.label}`));
      }))),

    h("div", { className: "foot" },
      `FC decay ${learned && learned.frac != null ? `${fmt(learned.frac * 100, 0)}%/day learned from your last ${learned.win} days` : `fallback ${fmt(effFrac * 100, 0)}%/day (need 2+ recent FC readings)`}. pH follows the carbonate system: acid, bicarb and trichlor act on alkalinity and dissolved CO₂, and CO₂ outgasses at ${learned && learned.phK != null ? `k=${fmt(learned.phK, 2)}/day (learned)` : `the fallback k=${fmt(effPhK, 2)}/day`} toward an equilibrium of pH ${fmt(effPhEq, 2)} (${effPhEqInfo.source}). CSI uses the TroubleFreePool formula with the pH-dependent CYA correction.`));
}

