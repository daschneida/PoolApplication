import { PARAMS, ADDITIVES, ACID_CHEM } from "../chem/additives.js";

/* ===================== design tokens ===================== */
export const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text',Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const C = {
  blue: "#1e3a8a", teal: "#06b6d4", coral: "#b45309", green: "#115e59", mint: "#a5f3fc",
  indigo: "#6d28d9", brown: "#be185d", choc: "#334155", gold: "#f59e0b", red: "#dc2626",
  g100: "#f1f5f9", g300: "#cbd5e1", g500: "#64748b", ink: "#0f172a", white: "#ffffff"
};
export const colorOf = key => (PARAMS.find(p => p.key === key) || {}).color || C.ink;
export const statusOf = (v, lo, hi) => {
  if (v == null) return { label: "no data", bg: C.g100, fg: C.ink };
  if (v < lo) return { label: "low", bg: C.red, fg: C.white };
  if (v > hi) return { label: "high", bg: C.red, fg: C.white };
  return { label: "in range", bg: C.mint, fg: C.green };
};
export const daysPhrase = c => c == null ? null : c.days <= 0 ? "now" : c.days === 1 ? "in 1 day" : `in ${c.days} days`;
export const doseColor = chem => chem === ACID_CHEM ? colorOf("ph") : ADDITIVES[chem].Cl ? colorOf("fc") : chem === "Sodium Bicarbonate" ? colorOf("ta") : chem === "Calcium Chloride" ? colorOf("ch") : C.ink;
