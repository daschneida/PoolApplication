import { MS_DAY } from "./time.js";

export const expSunSafe = (fc, r, days) => (fc == null || isNaN(fc) ? 0 : fc) * (r || 0) * (days || 0);
export function decayFC(fc, frac) {
  if (fc == null) return null;
  const f = Math.max(0, Math.min(0.95, frac || 0));
  return Math.max(0, fc * (1 - f));
}
export function driftPH(ph, eq, k) {
  return ph == null ? null : ph + (eq - ph) * (1 - Math.exp(-k));
}

// Elapsed sun-equivalent days between two timestamps. If all chlorine loss happens
// within the daily sun window (sunStart..sunEnd local hours), then `sunDays(t0, t1)`
// returns the equivalent count of full sun-windows between t0 and t1.
// Pure arithmetic, O(1): no loops, no day-by-day iteration.
// Decomposes into: (full midnight-crossings × sunHoursPerDay/24) + partial-day at start
// + partial-day at end. Each partial uses a single sunHoursElapsedToday() call.
export function sunHoursElapsedToday(hourOfDay, sunStart, sunEnd) {
  // How many sun hours have passed today as of `hourOfDay`. Clamped to [0, W].
  if (hourOfDay <= sunStart) return 0;
  if (hourOfDay >= sunEnd) return sunEnd - sunStart;
  return hourOfDay - sunStart;
}
export function sunDays(t0, t1, sunStart, sunEnd) {
  if (t1 <= t0) return 0;
  const s = Math.max(0, Math.min(24, +sunStart));
  const e = Math.max(0, Math.min(24, +sunEnd));
  const W = e - s;
  if (!(W > 0 && W < 24) || !isFinite(W)) return (t1 - t0) / MS_DAY; // fallback to uniform
  const d0 = new Date(t0), d1 = new Date(t1);
  const hour0 = d0.getHours() + d0.getMinutes() / 60 + d0.getSeconds() / 3600;
  const hour1 = d1.getHours() + d1.getMinutes() / 60 + d1.getSeconds() / 3600;
  // Midnight (00:00 local) of each day
  const midnight0 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime();
  const midnight1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime();
  // Number of full midnight crossings between t0 and t1
  const midnightsCrossed = Math.round((midnight1 - midnight0) / MS_DAY);
  if (midnightsCrossed === 0) {
    // Both within the same calendar day: net sun hours between hour0 and hour1
    const elapsed = sunHoursElapsedToday(hour1, s, e) - sunHoursElapsedToday(hour0, s, e);
    return Math.max(0, elapsed) / W;
  }
  // Partial sun-hours remaining today after t0
  const remainingToday = (W - sunHoursElapsedToday(hour0, s, e)) / W;
  // Partial sun-hours that have elapsed by t1 on its day
  const elapsedFinal = sunHoursElapsedToday(hour1, s, e) / W;
  // Full intermediate days each contribute exactly 1 sun-day
  const fullDays = midnightsCrossed - 1;
  return remainingToday + fullDays + elapsedFinal;
}

// Predict pH equilibrium from open-system carbonate chemistry.
// Atmospheric CO2 fixes dissolved CO2 (Henry's law); current TA, CYA, and temperature
// then set where the carbonate buffer balances. Returns null if inputs are insufficient.
// Reality caveat: real pools with aeration (waterfalls, jets) sit 0.1-0.2 higher than
// this prediction because aeration drives CO2 below atmospheric equilibrium.
