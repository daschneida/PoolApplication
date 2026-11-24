import { ADDITIVES, registerCustomAdditives } from "../src/chem/additives.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePlan, computeAdvice } from "../src/engine/planner.js";

const config = { volume: 19000, fcLo: 2, fcHi: 9, phLo: 7.4, phHi: 7.8, csiLo: -0.3, csiHi: 0.3, cyaLo: 40, cyaHi: 60, taLo: 80, taHi: 120, chLo: 200, chHi: 400, clStepOz: 64, acidDefaultOz: 43, chartDaysFwd: 7, sunStart: 11, sunEnd: 17, temp: 85 };
const latest = { t: Date.now(), date: "today", fc: 4.1, ph: 7.84, cya: 48, ta: 92, ch: 310, csi: 0.32 };
const HOUR = 3600000;
const series = [{ t: Date.now() + 18 * HOUR, _future: true, fc: 1.5 }]; // forecast crosses the low bound within a day
const later = [{ t: Date.now() + 3 * 86400000, _future: true, fc: 1.5 }]; // ... or three days out

test("chlorine is sized to the fewest 64 oz pours that reach the top of the range", () => {
  const plan = computePlan({ latest, series, config });
  assert.ok(plan.cl); assert.equal(plan.cl.pours, 2); assert.equal(plan.cl.defaultOz, 128);
});
test("chlorine waits while FC stays above the low bound for the next 24 hours, and says when it is due", () => {
  // 4.1 ppm losing 20 % per sun-day is 3.3 ppm tomorrow, above the 2 ppm floor
  const plan = computePlan({ latest, series: later, config, effFrac: 0.2 });
  assert.equal(plan.cl, null);
  assert.ok(plan.clNext); assert.equal(plan.clNext.days, 3);
  // no rate: the forecast points decide, and three days out is not today either
  assert.equal(computePlan({ latest, series: later, config }).cl, null);
});
test("chlorine is due today when FC is below the low bound now or by this time tomorrow", () => {
  assert.ok(computePlan({ latest: { ...latest, fc: 1.8 }, series: [], config, effFrac: 0.2 }).cl);
  // 2.3 ppm losing 20 % is 1.84 ppm tomorrow; the forecast's first point under 2 ppm is 30 h
  // out, past 24 h, so only the direct 24 h projection catches it
  const plan = computePlan({ latest: { ...latest, fc: 2.3 }, series: [{ t: Date.now() + 30 * HOUR, _future: true, fc: 1.7 }], config, effFrac: 0.2 });
  assert.ok(plan.cl); assert.equal(plan.clNext, null);
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

test("custom additives register with ppm-per-10k-gal label figures and cannot shadow built-ins", () => {
  registerCustomAdditives([{ name: "Borax", unit: "oz", per10k: { fc: 0, cya: 0, ta: 0.3, ch: 0 } }, { name: "Trichlor", unit: "oz", per10k: { fc: 99 } }]);
  assert.equal(ADDITIVES["Borax"].TA, 3000); assert.equal(ADDITIVES["Borax"].custom, true);
  assert.equal(ADDITIVES["Trichlor"].Cl, 6855);
  registerCustomAdditives([]); assert.equal(ADDITIVES["Borax"], undefined);
});
