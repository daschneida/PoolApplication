// Hand-checked numbers for the carbonate system against the owner's spreadsheet coefficients.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDose, phEquilibrium, outgasPH, carbK, dicOf, phOf } from "../src/chem/carbonate.js";
import { csi } from "../src/chem/csi.js";

const V = 19000, CH = 310, CYA = 48, T = 79;
const st = (ph, ta) => ({ fc: 3, ph, cya: CYA, ta, ch: CH, temp: T });
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test("43 fl oz of 31% muriatic at TA 92 matches the spreadsheet linearization (-0.60 pH, -9.8 TA)", () => {
  const r = applyDose(st(7.84, 92), "Muriatic acid (31%)", 43, V);
  near(r.ph - 7.84, -0.60, 0.03, "dpH");
  near(r.ta - 92, -9.8, 0.1, "dTA");
});
test("buffer effect: the same acid dose moves pH more at low alkalinity", () => {
  const lo = applyDose(st(7.84, 60), "Muriatic acid (31%)", 43, V).ph - 7.84;
  const hi = applyDose(st(7.84, 130), "Muriatic acid (31%)", 43, V).ph - 7.84;
  assert.ok(lo < -0.7 && hi > -0.55, `TA60 ${lo}, TA130 ${hi}`);
});
test("16 oz trichlor is close to the spreadsheet (-0.31) and consumes alkalinity", () => {
  const r = applyDose(st(7.6, 92), "Trichlor", 16, V);
  near(r.ph - 7.6, -0.31, 0.05, "dpH");
  assert.ok(r.ta < 92 && r.cya > CYA);
});
test("sodium bicarbonate matches Henderson-Hasselbalch for a small addition", () => {
  const r = applyDose(st(7.3, 70), "Sodium Bicarbonate", 16, V);
  near(r.ph - 7.3, Math.log10(1 + (4462 * 16 / V) / 70), 0.01, "dpH");
});
test("hypochlorite leaves pH and alkalinity alone", () => {
  const r = applyDose(st(7.6, 92), "NaOCl (10.5 wt%)", 64, V);
  assert.equal(r.ph, 7.6); assert.equal(r.ta, 92); near(r.fc, 3 + 977 * 64 / V, 1e-9, "fc");
});
test("open-system equilibrium pH sits in the 8.0-8.5 band for pool alkalinities", () => {
  for (const ta of [60, 92, 130]) { const e = phEquilibrium(ta, CYA, T, CH); assert.ok(e > 8.0 && e < 8.5, `TA ${ta}: ${e}`); }
});
test("outgassing raises pH monotonically toward equilibrium and never past it", () => {
  const eq = phEquilibrium(82, CYA, T, CH);
  let prev = 7.24;
  for (const d of [0.5, 1, 2, 4, 8, 30]) { const p = outgasPH(7.24, 82, CYA, d, 0.48, T, CH, null); assert.ok(p >= prev && p <= eq + 1e-6, `day ${d}: ${p}`); prev = p; }
});
test("pH / DIC round trip", () => {
  const k = carbK(T, CH, 92); near(phOf(92, dicOf(7.6, 92, CYA, k), CYA, k), 7.6, 1e-6, "round trip");
});
test("CSI reference point", () => {
  near(csi(7.84, CH, 92, CYA, T), 0.32, 0.01, "csi");
});
