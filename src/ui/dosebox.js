import { h } from "./react.js";
import { ADDITIVES } from "../chem/additives.js";

/* ===================== dose action box ===================== */
export function DoseBox({ title, chem, oz, steps, step, onChange, lines, note, onLog, hint }) {
  const unit = ADDITIVES[chem].unit;
  let dec, inc;
  if (steps) {
    const i = steps.indexOf(oz);
    dec = i > 0 ? () => onChange(steps[i - 1]) : null;
    inc = i >= 0 && i < steps.length - 1 ? () => onChange(steps[i + 1]) : null;
  } else {
    dec = oz > step ? () => onChange(oz - step) : null;
    inc = () => onChange(oz + step);
  }
  const pours = !steps && step ? Math.round(oz / step) : null;
  return h("div", { className: "dosebox" },
    h("div", null,
      h("div", { className: "dose-k" }, title),
      h("div", { className: "dose-amt" }, pours != null && pours > 1 ? `${oz} ${unit} · ${pours} × ${step}` : `${oz} ${unit}`),
      lines.map((l, i) => h("div", { key: i, className: "dose-line" }, l))),
    h("div", { className: "dose-row" },
      h("div", { className: "stepper", role: "group", "aria-label": `Amount of ${chem}` },
        h("button", { type: "button", "aria-label": "Less", disabled: !dec, onClick: dec || undefined }, "−"),
        h("span", null, `${oz} ${unit}`),
        h("button", { type: "button", "aria-label": "More", disabled: !inc, onClick: inc || undefined }, "+")),
      h("button", { type: "button", className: "btn-primary", onClick: onLog }, "Added, log it")),
    h("div", { className: "dose-note" }, note));
}

