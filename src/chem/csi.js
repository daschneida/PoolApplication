export function csi(pH, CH, TA, CYA, T_F, Salt, Borate) {
  if ([pH, CH, TA, CYA, T_F].some(v => v == null || isNaN(v))) return null;
  if (CH <= 0 || TA <= 0) return null;
  const salt = Salt || 0;
  const borate = Borate || 0;
  // 1. Carbonate alkalinity (pH-dependent CYA & borate corrections)
  const CarbAlk = TA - (0.38772 * CYA) / (1 + Math.pow(10, 6.83 - pH))
                     - (4.63 * borate) / (1 + Math.pow(10, 9.11 - pH));
  if (CarbAlk <= 0) return null;
  // 2. Excess NaCl above what calcium hardness contributes
  const extra_NaCl = Math.max(0, salt - 1.1678 * CH);
  // 3. Ionic strength (Davies form)
  const Ionic = (1.5 * CH + TA) / 50045 + extra_NaCl / 58440;
  // 4. Temperature: convert °F -> Kelvin
  const T_K = (T_F - 32) * 5 / 9 + 273.15;
  // Main TFP CSI formula
  const sqrtI = Math.sqrt(Ionic);
  const ionicTerm = (2.56 * sqrtI) / (1 + 1.65 * sqrtI);
  return pH - 11.677
       + Math.log10(CH)
       + Math.log10(CarbAlk)
       - ionicTerm
       - 1412.5 / T_K
       + 4.7375;
}
// Solve for the total alkalinity that produces a target CSI, holding pH/CH/CYA/temp
// fixed. CSI is monotonically increasing in TA over realistic ranges, so bisection
// is safe. Returns null if no solution exists in [1, 500] ppm (e.g. CYA too high
// relative to CH/temp for this target to be reachable at any TA).
export function taForCSI(target, pH, CH, CYA, T_F) {
  if ([target, pH, CH, CYA, T_F].some(v => v == null || isNaN(v))) return null;
  let lo = 1, hi = 500;
  const g = ta => { const v = csi(pH, CH, ta, CYA, T_F); return v == null ? -99 : v; };
  if (g(lo) - target > 0 || g(hi) - target < 0) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) - target > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
// Same idea, solving for calcium hardness instead. Also monotonic increasing in CH.
export function chForCSI(target, pH, TA, CYA, T_F) {
  if ([target, pH, TA, CYA, T_F].some(v => v == null || isNaN(v))) return null;
  let lo = 25, hi = 2000;
  const g = ch => { const v = csi(pH, ch, TA, CYA, T_F); return v == null ? -99 : v; };
  if (g(lo) - target > 0 || g(hi) - target < 0) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) - target > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
// Solve for the pH that produces a target CSI, holding CH/TA/CYA/temp fixed. Used
// to find the lowest pH that still keeps CSI at or above a floor. CSI is (very
// nearly) monotonically increasing in pH over realistic TA/CYA combinations, so
// bisection over the normal pool pH range is safe. Returns null if the target
// isn't reachable anywhere in [6.0, 9.0] — the caller checks the boundaries
// directly to explain why (already safe throughout, or never safe at this TA/CH).
export function phForCSI(target, CH, TA, CYA, T_F) {
  if ([target, CH, TA, CYA, T_F].some(v => v == null || isNaN(v))) return null;
  let lo = 6.0, hi = 9.0;
  const g = ph => { const v = csi(ph, CH, TA, CYA, T_F); return v == null ? -99 : v; };
  if (g(lo) - target > 0 || g(hi) - target < 0) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) - target > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
