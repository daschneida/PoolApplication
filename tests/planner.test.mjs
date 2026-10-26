import { test } from "node:test";
import assert from "node:assert/strict";
import { computePlan, computeAdvice } from "../src/engine/planner.js";

const config = { volume: 19000, fcLo: 2, fcHi: 9, phLo: 7.4, phHi: 7.8, csiLo: -0.3, csiHi: 0.3, cyaLo: 40, cyaHi: 60, taLo: 80, taHi: 120, chLo: 200, chHi: 400, clStepOz: 64, acidDefaultOz: 43, chartDaysFwd: 7, sunStart: 11, sunEnd: 17, temp: 85 };
const latest = { t: Date.now(), date: "today", fc: 4.1, ph: 7.84, cya: 48, ta: 92, ch: 310, csi: 0.32 };
const series = [{ t: Date.now() + 3 * 86400000, _future: true, fc: 1.5 }]; // forecast crosses the low bound

test("chlorine is sized to the fewest 64 oz pours that reach the top of the range", () => {
  const plan = computePlan({ latest, series, config });
  assert.ok(plan.cl); assert.equal(plan.cl.pours, 2); assert.equal(plan.cl.defaultOz, 128);
});
test("acid is offered only while pH is above the ceiling", () => {
  assert.ok(computePlan({ latest, series, config }).acid);
  assert.equal(computePlan({ latest: { ...latest, ph: 7.6 }, series, config }).acid, null);
});
test("the advice engine returns a scored best plan with a do-nothing baseline", () => {
  const plan = computePlan({ latest, series, config });
  const adv = computeAdvice({ latest, plan, config, effFrac: 0.3, effPhK: 0.4, effPhEq: 8.3, phEqOverride: null, lastTemp: 79 });
  assert.ok(adv.best && adv.none && adv.count > 1);
  assert.ok(adv.best.score <= adv.none.score);
  assert.ok(adv.best.doses.some(d => d.chem === "NaOCl (10.5 wt%)" && d.oz === 128));
});
