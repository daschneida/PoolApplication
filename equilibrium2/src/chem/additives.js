// Additive coefficients (ppm·gal per oz) from the owner's spreadsheet, and the parameter table.
/* ===== Additive coefficients (ppm*gal/oz) from your spreadsheet ===== */
export const ADDITIVES = {
  "NaOCl (10.5 wt%)": {
    Cl: 977,
    CYA: 0,
    TA: 0,
    pH: 0,
    CH: 0,
    unit: "fl oz"
  },
  "Ca(OCl)2 (53 wt%)": {
    Cl: 3937,
    CYA: 0,
    TA: 0,
    pH: 0,
    CH: 2778,
    unit: "oz"
  },
  "Ca(OCl)2 (59.5 wt%)": {
    Cl: 4417.875,
    CYA: 0,
    TA: 0,
    pH: 0,
    CH: 3123.75,
    unit: "oz"
  },
  "Ca(OCl)2 (65 wt%)": {
    Cl: 4828,
    CYA: 0,
    TA: 0,
    pH: 0,
    CH: 3408,
    unit: "oz"
  },
  "Ca(OCl)2 (70 wt%)": {
    Cl: 5199,
    CYA: 0,
    TA: 0,
    pH: 0,
    CH: 3670,
    unit: "oz"
  },
  "Ca(OCl)2 (73 wt%)": {
    Cl: 5422,
    CYA: 0,
    TA: 0,
    pH: 0,
    CH: 3827,
    unit: "oz"
  },
  "Ca(OCl)2 (78 wt%)": {
    Cl: 5794,
    CYA: 0,
    TA: 0,
    pH: 0,
    CH: 4089,
    unit: "oz"
  },
  "Trichlor": {
    Cl: 6855,
    CYA: 4159,
    TA: 0,
    pH: -367,
    CH: 0,
    unit: "oz"
  },
  "Dichlor (56% / 57% CYA)": {
    Cl: 5159,
    CYA: 4753,
    TA: 0,
    pH: -90,
    CH: 0,
    unit: "oz"
  },
  "Muriatic acid (14%)": {
    Cl: 0,
    CYA: 0,
    TA: -1956,
    pH: -120.1,
    CH: 0,
    unit: "fl oz"
  },
  "Muriatic acid (31%)": {
    Cl: 0,
    CYA: 0,
    TA: -4331,
    pH: -265.9,
    CH: 0,
    unit: "fl oz"
  },
  "Calcium Chloride": {
    Cl: 0,
    CYA: 0,
    TA: 0,
    pH: 0,
    CH: 6754,
    unit: "oz"
  },
  // 98 % cyanuric acid (granular, by weight): 28.35 g x 0.98 / 3.785 L per gal = 7340 ppm·gal/oz.
  // Check: 1 lb in 10,000 gal raises CYA by 11.7 ppm, matching the usual label figure of ~12.
  // Dissolves over a day or two; the model applies it at the logged time. Its acidity is
  // handled by the carbonate system (CYA added at constant total alkalinity lowers pH).
  "Cyanuric acid (98%)": {
    Cl: 0,
    CYA: 7340,
    TA: 0,
    pH: 0,
    CH: 0,
    unit: "oz"
  },
  "Sodium Bicarbonate": {
    Cl: 0,
    CYA: 0,
    TA: 4462,
    pH: 0,
    CH: 0,
    unit: "oz"
  }
};
export const PARAMS = [{
  key: "fc",
  label: "Free Chlorine",
  unit: "ppm",
  color: "#0369a1",
  lo: 2,
  hi: 6
}, {
  key: "ph",
  label: "pH",
  unit: "",
  color: "#b45309",
  lo: 7.4,
  hi: 7.8
}, {
  key: "cya",
  label: "Cyanuric Acid",
  unit: "ppm",
  color: "#047857",
  lo: 40,
  hi: 60
}, {
  key: "ta",
  label: "Alkalinity",
  unit: "ppm",
  color: "#6d28d9",
  lo: 80,
  hi: 120
}, {
  key: "ch",
  label: "Calcium hardness",
  unit: "ppm",
  color: "#be185d",
  lo: 200,
  hi: 400
}, {
  key: "csi",
  label: "Saturation index",
  unit: "",
  color: "#334155",
  lo: -0.3,
  hi: 0.3
}];
export const CL_CHEM = "NaOCl (10.5 wt%)";
export const ACID_CHEM = "Muriatic acid (31%)";
export const ACID_BASE_STEPS = [32, 43, 64];
// Stepper positions for acid: the base container sizes plus whatever default the user typed.
export const acidStepsFor = config => { const d = Number(config.acidDefaultOz); const arr = ACID_BASE_STEPS.slice(); if (d > 0 && !arr.includes(d)) arr.push(d); return arr.sort((a, b) => a - b); };
export const acidDefaultFor = config => { const d = Number(config.acidDefaultOz); return d > 0 ? d : 43; };
export const CL_STEPS = { "Trichlor": [8, 16, 24], "Ca(OCl)2 (73 wt%)": [16, 32, 48] };

// ---------- user-defined additives (Settings → Additives) ----------
// Stored in config.customAdditives as { name, unit: "oz" | "fl oz", per10k: { fc, cya, ta, ch } }
// where per10k is the ppm change from ONE unit in a 10,000-gal pool, the figure most product
// labels give. The spreadsheet convention used everywhere else is ppm·gal per unit, so the
// coefficient is per10k x 10,000. Registered entries live in the same ADDITIVES map, so the
// Log, the model and the history treat them like the built-ins. pH is left to the carbonate
// system (enter the TA change for acids and bases).
const CUSTOM_KEYS = new Set();
const num0 = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export function registerCustomAdditives(list) {
  for (const k of CUSTOM_KEYS) delete ADDITIVES[k];
  CUSTOM_KEYS.clear();
  (Array.isArray(list) ? list : []).forEach(c => {
    if (!c || c.name == null) return;
    const name = String(c.name).trim();
    if (!name || (name in ADDITIVES)) return; // built-in names cannot be shadowed
    const p = c.per10k || {};
    ADDITIVES[name] = { Cl: num0(p.fc) * 10000, CYA: num0(p.cya) * 10000, TA: num0(p.ta) * 10000, pH: 0, CH: num0(p.ch) * 10000, unit: c.unit === "fl oz" ? "fl oz" : "oz", custom: true };
    CUSTOM_KEYS.add(name);
  });
  return ADDITIVES;
}
export const isCustomAdditive = name => CUSTOM_KEYS.has(name);
