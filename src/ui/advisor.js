import { h, useState, React } from "./react.js";
import { C, colorOf, doseColor } from "./theme.js";
import { Card, CardHead } from "./pieces.js";
import { ADDITIVES } from "../chem/additives.js";
import { tsOf } from "../chem/time.js";
import { csi, taForCSI, phForCSI } from "../chem/csi.js";
import { applyDose } from "../chem/carbonate.js";
import { fmt, fmtVal } from "../util.js";
import { summaryLine, doseLabel } from "../engine/planner.js";

/* ===================== ADVISOR ===================== */
export function Advisor({ measurements, latest, config, learned, effFrac, plan, advice, effectOf, logDoseNow, curTemp, effPhEq, effPhK }) {
  const chLatest = latest ? latest.ch : null;
  const taLatest = latest ? latest.ta : null;
  const phLatest = latest ? latest.ph : null;
  const cyaLatest = latest ? latest.cya : null;
  const tempFromLog = (() => {
    const withTemp = measurements.filter(m => m.temp != null).slice().sort((a, b) => tsOf(a) - tsOf(b));
    return withTemp.length ? Number(withTemp[withTemp.length - 1].temp) : null;
  })();
  const defaultTemp = tempFromLog != null ? tempFromLog : config.temp;
  const [tempOverride, setTempOverride] = useState("");
  const T_F = tempOverride !== "" && !isNaN(tempOverride) ? Number(tempOverride) : defaultTemp;
  // Calcium hardness is treated as a fixed, static input here — no what-if override,
  // no dosing advice. It's read straight from the latest log entry.
  const CH = chLatest;
  const CYA = cyaLatest;
  const numOr = (v, d) => v === "" || v == null || isNaN(v) ? d : Number(v);
  const phMid = (numOr(config.phLo, 7.4) + numOr(config.phHi, 7.8)) / 2;
  const csiLo = numOr(config.csiLo, -0.3);
  const csiHi = numOr(config.csiHi, 0.3);
  const ready = [CH, CYA, T_F].every(v => v != null && !isNaN(v));

  const taLo = ready ? taForCSI(csiLo, phMid, CH, CYA, T_F) : null;
  const taHi = ready ? taForCSI(csiHi, phMid, CH, CYA, T_F) : null;

  const frac = effFrac != null ? effFrac : config.rSun || 0.45;
  const seasonalT = Math.max(0, Math.min(1, frac / 0.5));
  const taTarget = taLo != null && taHi != null ? taHi - seasonalT * (taHi - taLo) : null;
  const seasonLabel = frac < 0.15 ? "low \u2014 winter-like" : frac < 0.3 ? "moderate" : "high \u2014 summer-like";
  const inBox = taLatest != null && taLo != null && taHi != null && taLatest >= taLo && taLatest <= taHi;

  const taDose = (() => {
    if (taLatest == null || taTarget == null) return null;
    const delta = taTarget - taLatest;
    if (Math.abs(delta) < 3) return null;
    if (delta < 0) {
      const add = ADDITIVES["Muriatic acid (14%)"];
      const oz = Math.round(Math.abs(delta) * config.volume / Math.abs(add.TA));
      const dPh = phLatest == null ? 0 : applyDose({ fc: null, ph: phLatest, cya: CYA, ta: taLatest, ch: CH, temp: T_F }, "Muriatic acid (14%)", oz, config.volume).ph - phLatest;
      return {
        chem: "Muriatic acid (14%)",
        oz,
        note: "lowers TA toward " + fmt(taTarget, 0) + " ppm; also drops pH by about " + fmt(Math.abs(dPh), 2) + ", from " + fmt(phLatest, 2) + " toward " + fmt((phLatest == null ? phMid : phLatest) + dPh, 2)
      };
    }
    const add = ADDITIVES["Sodium Bicarbonate"];
    const oz = Math.round(delta * config.volume / add.TA);
    const dPh = phLatest == null || !(taLatest > 0) ? 0 : applyDose({ fc: null, ph: phLatest, cya: CYA, ta: taLatest, ch: CH, temp: T_F }, "Sodium Bicarbonate", oz, config.volume).ph - phLatest;
    return {
      chem: "Sodium Bicarbonate",
      oz,
      note: "raises TA toward " + fmt(taTarget, 0) + " ppm; also lifts pH by about " + fmt(dPh, 2) + ", from " + fmt(phLatest, 2) + " toward " + fmt((phLatest == null ? phMid : phLatest) + dPh, 2)
    };
  })();

  // Lowest pH that still keeps CSI at or above your configured floor (csiLo), holding
  // CH/CYA/temp fixed — computed both at your current logged TA and at the box's
  // seasonally-adjusted target TA, since the floor moves if you act on that TA advice.
  const phFloorAt = TA => {
    if (!ready || TA == null) return null;
    const v = phForCSI(csiLo, CH, TA, CYA, T_F);
    if (v != null) return { value: v, reason: null };
    const atLowBound = csi(6.0, CH, TA, CYA, T_F);
    const atHighBound = csi(9.0, CH, TA, CYA, T_F);
    if (atLowBound != null && atLowBound >= csiLo) return { value: null, reason: "below" };
    if (atHighBound != null && atHighBound < csiLo) return { value: null, reason: "never" };
    return { value: null, reason: null };
  };
  const floorCurrent = phFloorAt(taLatest);
  const floorTarget = phFloorAt(taTarget);

  // ---------- render ----------
  const acEff = plan.acid ? effectOf(plan.acid.chem, plan.acid.defaultOz) : null;
  const acCapOz = plan.acid ? plan.acid.steps[plan.acid.steps.length - 1] : null;
  const acCap = plan.acid ? effectOf(plan.acid.chem, acCapOz) : null;
  const scaleMax = taLo == null || taHi == null ? 200 : Math.max(200, Math.ceil(taHi * 1.2 / 50) * 50);
  const pct = v => v == null ? null : Math.max(0, Math.min(100, v / scaleMax * 100));
  const floorText = (floor, taVal) => {
    if (taVal == null) return "—";
    if (floor && floor.value != null) return fmt(floor.value, 2);
    if (floor && floor.reason === "below") return "none";
    if (floor && floor.reason === "never") return "n/a";
    return "—";
  };
  const floorNote = (() => {
    const f = floorCurrent;
    if (!f) return null;
    if (f.value != null && phLatest != null) {
      const m = phLatest - f.value;
      return m < 0 ? `You are already ${fmt(Math.abs(m), 2)} below the floor; raise pH or alkalinity before anything else.`
        : `${fmt(m, 2)} of headroom below your current pH; an acid dose that overshoots a little will not turn the water corrosive.`;
    }
    if (f.reason === "below") return "pH is not the limit here: CSI stays above your floor even at pH 6.0.";
    if (f.reason === "never") return "Even pH 9.0 cannot reach your CSI floor; TA or CH needs to come up regardless of pH.";
    return null;
  })();
  return h("div", { className: "page" },
    advice ? h(Card, { accent: C.teal },
      h(CardHead, { title: `Dose plan · next ${advice.days} days`, sub: `${advice.count} container-sized plans simulated with the chart model` }),
      advice.best.doses.length ? h("div", { className: "rec" }, advice.best.doses.map((d, i) => h("div", { key: i, className: "rec-amt" }, h("b", { style: { color: doseColor(d.chem) } }, `${d.oz} ${ADDITIVES[d.chem].unit}`), h("span", null, d.chem))))
        : h("p", { className: "p" }, h("b", null, "Best plan: add nothing today.")),
      h("p", { className: "p" }, `With it: ${summaryLine(advice.best.summary)}.`),
      advice.none && advice.none !== advice.best ? h("p", { className: "p" }, `Doing nothing: ${summaryLine(advice.none.summary)}.`) : null,
      advice.alt ? h("p", { className: "p" }, `Runner-up: ${advice.alt.doses.length ? advice.alt.doses.map(doseLabel).join(" + ") : "nothing"} → ${summaryLine(advice.alt.summary)}.`) : null,
      h("p", { className: "p" }, "Timing: chlorine after the sun window, acid with the pump running and at least 30 minutes away from any chlorine. Chlorine is sized to the top of your range; everything else is scored on squared distance outside your target ranges over the horizon, with the 1 ppm floor, pH and CSI carrying the most weight."),
      advice.best.doses.length ? h("button", { type: "button", className: "btn-primary tall", onClick: () => advice.best.doses.forEach(d => logDoseNow(d.chem, d.oz)) }, advice.best.doses.length === 1 ? `Added ${doseLabel(advice.best.doses[0])}, log it` : "Added all of these, log them") : null) : null,
    h("p", { className: "p lead" }, "Where should alkalinity and pH sit so CSI stays in range at this calcium, CYA and temperature?"),
    h(Card, null,
      h(CardHead, { title: "Current conditions" }),
      h("div", { className: "grid3" },
        h("div", { className: "field" }, h("label", { htmlFor: "adv-temp" }, "Water temp °F"), h("input", { id: "adv-temp", type: "number", inputMode: "decimal", placeholder: fmt(defaultTemp, 0), value: tempOverride, onChange: e => setTempOverride(e.target.value) }), h("span", { className: "hint" }, "blank = last log")),
        h("div", { className: "field" }, h("span", { className: "lab" }, "Calcium"), h("b", { className: "ro", style: { color: colorOf("ch") } }, fmt(chLatest, 0), " ppm"), h("span", { className: "hint" }, "from log, fixed")),
        h("div", { className: "field" }, h("span", { className: "lab" }, "Cl loss"), h("b", { className: "ro", style: { color: colorOf("fc") } }, `${fmt(frac * 100, 0)}%/day`), h("span", { className: "hint" }, seasonLabel)))),
    !ready ? h("div", { className: "banner" }, h("span", { className: "sq", style: { background: C.gold } }), h("span", null, "Need CH, CYA and a temperature reading to compute a target. Log a full measurement first."))
      : h(React.Fragment, null,
        h(Card, { accent: colorOf("ta") },
          h(CardHead, { title: "Alkalinity box", sub: `pH held at ${fmt(phMid, 2)} · CSI ${fmtVal("csi", csiLo)} to ${fmtVal("csi", csiHi)}` }),
          taLo == null || taHi == null ? h("p", { className: "p" }, "No TA hits your CSI target at this CH and temperature; CYA is too high relative to them.")
            : h(React.Fragment, null,
              h("div", { className: "hero-row", style: { alignItems: "baseline" } },
                h("div", { className: "hero-val mid", style: { whiteSpace: "nowrap", fontSize: 32 } }, h("span", { style: { color: colorOf("ta") } }, `${fmt(taLo, 0)}–${fmt(taHi, 0)}`)),
                h("div", { className: "hero-side", style: { textAlign: "left", alignItems: "flex-start" } }, h("span", null, "ppm · aim near ", h("b", null, `${fmt(taTarget, 0)}`), ` given your ${seasonLabel} chlorine loss`))),
              h("div", { className: "tabar" },
                h("div", { className: "tabar-box", style: { left: `${pct(taLo)}%`, width: `${pct(taHi) - pct(taLo)}%` } }),
                h("div", { className: "tabar-pin", style: { left: `${pct(taTarget)}%`, background: colorOf("ta") } }),
                taLatest != null ? h("div", { className: "tabar-pin", style: { left: `${pct(taLatest)}%`, background: C.ink } }) : null),
              h("div", { className: "gauge-axis" }, h("span", null, "0"), h("span", null, `${fmt(taLo, 0)}`), h("span", null, taLatest != null ? `current ${fmt(taLatest, 0)} · target ${fmt(taTarget, 0)}` : `target ${fmt(taTarget, 0)}`), h("span", null, `${fmt(taHi, 0)}`), h("span", null, `${scaleMax}`)),
              h("p", { className: "p" }, taLatest == null ? "No current TA logged." : inBox ? `Current TA (${fmt(taLatest, 0)}) is inside the box and ${fmt(Math.abs(taLatest - taTarget), 0)} ppm from the seasonal target.` : `Current TA (${fmt(taLatest, 0)}) is ${taLatest < taLo ? "below" : "above"} the box.`))),
        h(Card, { accent: colorOf("ph") },
          h(CardHead, { title: "Lowest safe pH", sub: `keeps CSI ≥ ${fmtVal("csi", csiLo)}` }),
          h("div", { className: "grid2" },
            h("div", { className: "stat" }, h("span", null, `at current TA ${fmt(taLatest, 0)}`), h("b", { style: { color: colorOf("ph") } }, floorText(floorCurrent, taLatest))),
            h("div", { className: "stat" }, h("span", null, `at target TA ${fmt(taTarget, 0)}`), h("b", { style: { color: colorOf("ph") } }, floorText(floorTarget, taTarget)))),
          floorNote ? h("p", { className: "p" }, floorNote) : null),
        h(Card, null,
          h(CardHead, { title: "To reach the target" }),
          plan.acid && acEff ? h("div", { className: "rec" },
            h("div", { className: "rec-amt" }, h("b", { style: { color: colorOf("ph") } }, `${plan.acid.defaultOz} fl oz`), h("span", null, plan.acid.chem)),
            h("p", { className: "p" }, `Your standard acid dose, called for because pH ${fmt(phLatest, 2)} is above the ${fmt(numOr(config.phHi, 7.8), 1)} ceiling. Immediately: pH ${fmt(acEff.ph, 2)}, TA ${fmt(acEff.ta, 0)}, CSI ${fmtVal("csi", acEff.csiNow)}${floorCurrent && floorCurrent.value != null && acEff.ph < floorCurrent.value ? `, ${fmt(floorCurrent.value - acEff.ph, 2)} past the floor` : ""}. Drift at k=${fmt(effPhK, 2)}/day brings pH to ${fmt(acEff.ph1, 2)} by this time tomorrow (CSI ${fmtVal("csi", acEff.csi1)}).${acCap && acCapOz !== plan.acid.defaultOz ? ` ${acCapOz} fl oz is the cap and would sit at ${fmt(acCap.ph, 2)} / CSI ${fmtVal("csi", acCap.csiNow)}.` : ""}`),
            h("button", { type: "button", className: "btn-primary tall", onClick: () => logDoseNow(plan.acid.chem, plan.acid.defaultOz) }, `Added ${plan.acid.defaultOz} fl oz, log it`))
            : h("div", { className: "rec" }, h("div", { className: "rec-amt" }, h("b", null, "0 fl oz"), h("span", null, "muriatic acid")), h("p", { className: "p" }, phLatest == null ? "No pH reading yet." : `pH ${fmt(phLatest, 2)} is at or below the ${fmt(numOr(config.phHi, 7.8), 1)} ceiling; no acid until it is called for.`)),
          h("div", { className: "rec", style: { borderTop: `1.33px solid ${C.g300}`, paddingTop: 12 } },
            taDose ? h(React.Fragment, null,
              h("div", { className: "rec-amt" }, h("b", { style: { color: colorOf("ta") } }, `${taDose.oz} ${ADDITIVES[taDose.chem].unit}`), h("span", null, taDose.chem)),
              h("p", { className: "p" }, taDose.note[0].toUpperCase() + taDose.note.slice(1) + "."),
              h("button", { type: "button", className: "btn-ghost full", onClick: () => logDoseNow(taDose.chem, taDose.oz) }, `Added ${taDose.oz} ${ADDITIVES[taDose.chem].unit}, log it`))
              : h(React.Fragment, null, h("div", { className: "rec-amt" }, h("b", null, "0 oz"), h("span", null, "sodium bicarbonate")), h("p", { className: "p" }, taLatest == null ? "No TA logged." : "Alkalinity is already within 3 ppm of the seasonal target; bicarb would also lift pH."))))),
    h("div", { className: "foot" }, "Alkalinity box and pH floor are both solved from the CSI formula by bisection, holding CH at the logged value and pH at the target midpoint for the box. The seasonal aim slides from the box top (winter) to the box bottom (summer) using the learned chlorine-loss rate."));
}

