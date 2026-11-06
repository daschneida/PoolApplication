import { tsOf } from "../chem/time.js";
import { predictPhEq } from "../chem/carbonate.js";

// pH equilibrium: manual override if set, else predicted from the latest reading's chemistry.
export function computePhEqInfo({ config, measurements }) {
  const override = config.phEq;
  const hasOverride = override !== "" && override != null && !isNaN(override);
  if (hasOverride) return { value: Number(override), source: "override" };
  // Use the most recent measurement that has the inputs we need
  const recentMs = measurements
    .filter(m => m.ta != null && m.ph != null)
    .sort((a, b) => tsOf(b) - tsOf(a));
  const m = recentMs[0];
  if (m) {
    const chM = measurements.filter(x => x.ch != null).sort((a, b) => tsOf(b) - tsOf(a))[0];
    const pred = predictPhEq(m.ta, m.cya, m.ph, m.temp || config.temp || 85, chM ? chM.ch : null);
    if (pred != null && isFinite(pred)) return { value: pred, source: "predicted" };
  }
  return { value: 8.0, source: "default" };
}

// Most recent logged water temperature, else the Settings default.
export function computeLastTemp({ measurements, config }) {
  const withTemp = measurements.filter(m => m.temp != null && m.temp !== "").slice().sort((a, b) => tsOf(a) - tsOf(b));
  return withTemp.length ? Number(withTemp[withTemp.length - 1].temp) : Number(config.temp) || 85;
}

