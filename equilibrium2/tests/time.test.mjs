import { test } from "node:test";
import assert from "node:assert/strict";
import { tsOf, stampSeconds, nowLocalDT } from "../src/chem/time.js";

test("legacy date-only entries sit at local noon", () => {
  assert.equal(new Date(tsOf({ date: "2025-02-01" })).getHours(), 12);
});
test("seconds are preserved and ordered", () => {
  assert.ok(tsOf({ ts: "2026-10-25T22:20:11" }) > tsOf({ ts: "2026-10-25T22:20:10" }));
});
test("stampSeconds appends :00 to back-dated minute stamps and real seconds to the current minute", () => {
  assert.equal(stampSeconds("2025-01-01T08:00"), "2025-01-01T08:00:00");
  assert.match(stampSeconds(nowLocalDT()), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
});
