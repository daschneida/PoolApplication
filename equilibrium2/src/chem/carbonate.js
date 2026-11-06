import { ADDITIVES } from "./additives.js";

export const bicarPHShift = (dTA, currentTA) => {
  if (!currentTA || currentTA <= 0 || !dTA || dTA <= 0) return 0;
  return Math.log10(1 + dTA / currentTA);
};



export function predictPhEq(TA, CYA, pH_current, T_F, CH) {
  // Open-system equilibrium pH from the carbonate module (dissolved CO2 in balance with
  // the atmosphere at this alkalinity). pH_current is no longer needed but kept for callers.
  if (TA == null || TA <= 0 || T_F == null) return null;
  return phEquilibrium(TA, CYA || 0, T_F, CH || 300);
}
/* ===================== CARBONATE SYSTEM =====================
   Explicit CO2 / HCO3- / CO3-- chemistry so that acid, bicarbonate, trichlor and
   CO2 outgassing all act on one consistent state (total alkalinity + dissolved
   inorganic carbon) instead of per-chemical linear pH coefficients.

   Constants (freshwater, molal ~ molar at pool ionic strength):
     K1, K2, KH   Plummer & Busenberg (1982), Geochim. Cosmochim. Acta 46, 1011.
     Kw           Harned & Owen (1958) fit.
     Cyanurate    TFP apparent pKa 6.83 and 0.38772 ppm-CaCO3 per ppm CYA, the same
                  term csi() uses, so CSI and the pH model see the same alkalinity.
     Activity     Davies equation on the same ionic strength estimate csi() uses:
                  I = (1.5*CH + TA)/50045.  pH is treated as an activity.
     pCO2         425 uatm (2026 atmosphere). Equilibrium pH is where dissolved CO2
                  matches KH*pCO2; the user may override it in Settings.
   Units inside: alkalinity and DIC in mol/L (eq/L); TA/CYA/CH in ppm at the API.
   ============================================================ */
export const PCO2_ATM = 425e-6;
export const PPM_CACO3_PER_EQ = 50044;      // mg CaCO3 per eq (ppm as CaCO3 -> eq/L is /50044)
export const CYA_MW = 129070;               // mg/mol cyanuric acid
export const ALK_PPM_PER_FC_PPM = 50.044 / 70.906; // ppm CaCO3 of alkalinity consumed per ppm FC (as Cl2) when one HOCl is reduced
export function carbK(T_F, CH, TA) {
  const T = ((T_F == null || isNaN(T_F) ? 80 : T_F) - 32) * 5 / 9 + 273.15;
  const lgT = Math.log10(T);
  const K1 = Math.pow(10, -356.3094 - 0.06091964 * T + 21834.37 / T + 126.8339 * lgT - 1684915 / (T * T));
  const K2 = Math.pow(10, -107.8871 - 0.03252849 * T + 5151.79 / T + 38.92561 * lgT - 563713.9 / (T * T));
  const KH = Math.pow(10, 108.3865 + 0.01985076 * T - 6919.53 / T - 40.45154 * lgT + 669365 / (T * T));
  const Kw = Math.pow(10, -4470.99 / T + 6.0875 - 0.01706 * T);
  const I = Math.max(0, (1.5 * (CH || 300) + (TA || 80)) / 50045);
  const sI = Math.sqrt(I);
  const A = 0.5085 + 0.00085 * (T - 298.15);
  const lg = z => -A * z * z * (sI / (1 + sI) - 0.3 * I);
  const g1 = Math.pow(10, lg(1)), g2 = Math.pow(10, lg(2));
  // mixed constants: H+ as activity, other ions as concentrations
  return { K1: K1 / g1, K2: K2 * g1 / g2, KH, Kw: Kw / g1, co2eq: KH * PCO2_ATM };
}
// Alkalinity (eq/L) for a given pH, DIC (mol/L) and CYA (ppm).
export function alkOf(pH, DIC, CYA, k) {
  const H = Math.pow(10, -pH);
  const a = k.K1 / H, b = k.K1 * k.K2 / (H * H), D = 1 + a + b;
  const carb = DIC * (a + 2 * b) / D;
  const cya = (CYA || 0) / CYA_MW / (1 + Math.pow(10, 6.83 - pH));
  return carb + cya + k.Kw / H - H;
}
// DIC (mol/L) consistent with a measured pH and total alkalinity.
export function dicOf(pH, TA_ppm, CYA, k) {
  const H = Math.pow(10, -pH);
  const a = k.K1 / H, b = k.K1 * k.K2 / (H * H), D = 1 + a + b;
  const cya = (CYA || 0) / CYA_MW / (1 + Math.pow(10, 6.83 - pH));
  const carbAlk = TA_ppm / PPM_CACO3_PER_EQ - cya - k.Kw / H + H;
  return Math.max(0, carbAlk * D / (a + 2 * b));
}
export function co2Of(pH, TA_ppm, CYA, k) {
  const H = Math.pow(10, -pH);
  const D = 1 + k.K1 / H + k.K1 * k.K2 / (H * H);
  return dicOf(pH, TA_ppm, CYA, k) / D;
}
// pH from total alkalinity and DIC (alkalinity rises monotonically with pH).
export function phOf(TA_ppm, DIC, CYA, k) {
  const target = TA_ppm / PPM_CACO3_PER_EQ;
  let lo = 4, hi = 11.5;
  if (alkOf(lo, DIC, CYA, k) > target) return lo;
  if (alkOf(hi, DIC, CYA, k) < target) return hi;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (alkOf(mid, DIC, CYA, k) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
// Open-system equilibrium pH: dissolved CO2 in balance with the atmosphere at this TA.
export function phEquilibrium(TA_ppm, CYA, T_F, CH) {
  if (TA_ppm == null || !(TA_ppm > 0)) return null;
  const k = carbK(T_F, CH, TA_ppm);
  let lo = 6, hi = 10.5;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (co2Of(mid, TA_ppm, CYA, k) > k.co2eq) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
// CO2 outgassing (or uptake) over `days` at rate kg (1/day): first-order approach of
// dissolved CO2 to its equilibrium value at constant alkalinity. Returns the new pH.
// phEqOverride, if given, sets the target CO2 to the value that pH would have at this TA.
export function outgasPH(pH, TA_ppm, CYA, days, kg, T_F, CH, phEqOverride) {
  if (pH == null || TA_ppm == null || !(TA_ppm > 0) || !(days > 0)) return pH;
  const k = carbK(T_F, CH, TA_ppm);
  const target = phEqOverride != null ? co2Of(phEqOverride, TA_ppm, CYA, k) : k.co2eq;
  const DIC = dicOf(pH, TA_ppm, CYA, k);
  const H = Math.pow(10, -pH);
  const D = 1 + k.K1 / H + k.K1 * k.K2 / (H * H);
  const co2 = DIC / D;
  const co2n = target + (co2 - target) * Math.exp(-(kg || 0) * days);
  return phOf(TA_ppm, Math.max(0, DIC - (co2 - co2n)), CYA, k);
}
// Add dTA_ppm of alkalinity (negative for acid) and dDIC_ppm of inorganic carbon
// (as ppm CaCO3-equivalents; bicarbonate adds 1 mol C per eq) and/or dCYA ppm.
// Closed system on the timescale of pouring: DIC is conserved except for what the
// additive itself carries. Returns { ph, ta }.
export function doseAcidBase(pH, TA_ppm, CYA, dTA_ppm, dDIC_ppm, dCYA, T_F, CH) {
  if (pH == null || TA_ppm == null || !(TA_ppm > 0)) return { ph: pH, ta: TA_ppm == null ? null : TA_ppm + (dTA_ppm || 0) };
  const k = carbK(T_F, CH, TA_ppm);
  const DIC = dicOf(pH, TA_ppm, CYA, k) + (dDIC_ppm || 0) / PPM_CACO3_PER_EQ;
  const TA_n = Math.max(1, TA_ppm + (dTA_ppm || 0));
  return { ph: phOf(TA_n, DIC, (CYA || 0) + (dCYA || 0), k), ta: TA_n };
}
// Alkalinity consumed when a chlorine source's HOCl is eventually reduced, in eq of
// alkalinity per mol of HOCl delivered: trichlor 1 (acid form), dichlor 0.5 (half
// neutralized as the sodium salt), hypochlorites 0 (their base offsets the acid).
export const HOCL_ACID_EQ = { "Trichlor": 1, "Dichlor (56%/57% CYA)": 0.5 };
// One place that turns a dose into state deltas. st = {fc, ph, cya, ta, ch, temp}; V gallons.
// Returns the new state (fc/cya/ch linear from the spreadsheet coefficients; ta/ph from
// the carbonate system when pH and TA are known, else the spreadsheet pH coefficient).
export function applyDose(st, chem, oz, V) {
  const a = ADDITIVES[chem];
  if (!a || !(oz > 0) || !(V > 0)) return st;
  const dFc = a.Cl * oz / V, dCya = a.CYA * oz / V, dCh = a.CH * oz / V;
  let dTA = a.TA * oz / V;
  const acidEq = HOCL_ACID_EQ[chem] || 0;
  if (acidEq) dTA -= acidEq * ALK_PPM_PER_FC_PPM * dFc;
  const dDIC = chem === "Sodium Bicarbonate" ? dTA : 0;
  const n = { ...st };
  if (n.fc == null && dFc) n.fc = 0;
  if (n.cya == null && dCya) n.cya = 0;
  if (n.ch == null && dCh) n.ch = 0;
  if (n.fc != null) n.fc += dFc;
  if (n.ch != null) n.ch += dCh;
  const cya0 = n.cya;
  if (n.cya != null) n.cya += dCya;
  const movesCarbonate = dTA !== 0 || dCya !== 0;
  if (movesCarbonate && n.ph != null && n.ta != null && n.ta > 0) {
    const r = doseAcidBase(n.ph, n.ta, cya0 || 0, dTA, dDIC, dCya, n.temp, n.ch);
    n.ph = r.ph; n.ta = r.ta;
  } else {
    if (n.ta == null && dTA) n.ta = 0;
    if (n.ta != null) n.ta += dTA;
    if (n.ph != null) n.ph += a.pH * oz / V; // fallback: spreadsheet coefficient
  }
  return n;
}

