import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLearned } from "../src/engine/learned.js";

const now = Date.now(); const ts = d => new Date(now - d * 86400000).toISOString().slice(0, 19);
const cfg = { volume: 19000, lossWindow: 14, temp: 80 };
const base = { ta: 90, cya: 50, ch: 300, temp: 80 };

test("pH rising a full kit step per day fits a clearly positive outgassing rate", () => {
  const m = [{ ts: ts(3), ph: 7.4, ...base }, { ts: ts(2), ph: 7.6 }, { ts: ts(1), ph: 7.8 }, { ts: ts(0), ph: 7.8 }];
  const r = computeLearned({ measurements: m, doses: [], config: cfg, effPhEq: 8.3, phEqOverride: null });
  assert.ok(r.phK > 0.4 && r.phK < 1.5, `k=${r.phK}`);
});
test("unchanged readings bound the rate from above instead of forcing it to zero", () => {
  const m = [{ ts: ts(3), ph: 7.6, ...base }, { ts: ts(2), ph: 7.6 }, { ts: ts(1), ph: 7.6 }, { ts: ts(0), ph: 7.6 }];
  const r = computeLearned({ measurements: m, doses: [], config: cfg, effPhEq: 8.3, phEqOverride: null });
  assert.ok(r.phK > 0.1 && r.phK < 0.6, `k=${r.phK}`);
});
test("a reading logged before a same-day acid dose does not wreck the fit", () => {
  const m = [{ ts: ts(4), ph: 7.5, ...base }, { ts: ts(3), ph: 7.6 }, { ts: ts(2) + "", ph: 7.8 }, { ts: ts(1), ph: 7.2 }, { ts: ts(0), ph: 7.3 }];
  const d = [{ ts: ts(2).slice(0, 10) + "T06:00:00", chem: "Muriatic acid (31%)", oz: 64 }]; // acid logged the morning of the 7.8 reading
  const r = computeLearned({ measurements: m, doses: d, config: cfg, effPhEq: 8.3, phEqOverride: null });
  assert.ok(r.phK != null && r.phK < 1.5, `k=${r.phK}`);
});

test("pH that only falls between readings cannot pin a rate: learned k is null so the fallback applies", () => {
  const m = [{ ts: ts(3), ph: 7.8, ...base }, { ts: ts(2), ph: 7.6 }, { ts: ts(1), ph: 7.4 }, { ts: ts(0), ph: 7.4 }];
  const r = computeLearned({ measurements: m, doses: [], config: cfg, effPhEq: 8.3, phEqOverride: null });
  assert.equal(r == null ? null : r.phK, null);
});
test("blank pH strings are ignored and never produce NaN", () => {
  const m = [{ ts: ts(3), ph: 7.4, ...base }, { ts: ts(2), ph: "" }, { ts: ts(1), ph: 7.8 }, { ts: ts(0), ph: 7.8 }];
  const r = computeLearned({ measurements: m, doses: [], config: cfg, effPhEq: 8.3, phEqOverride: null });
  assert.ok(r.phK == null || Number.isFinite(r.phK));
  assert.ok(r.phK > 0.2, `k=${r.phK}`);
});
