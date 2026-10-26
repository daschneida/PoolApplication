import { h } from "./react.js";
import { C, colorOf } from "./theme.js";
import { Card, CardHead } from "./pieces.js";
import { acidStepsFor } from "../chem/additives.js";
import { fmt, numOrDef } from "../util.js";
import { SYNC_ON } from "../sync.js";

/* ===================== SETTINGS ===================== */
export function Settings({ config, setConfig, learned, effPhK, effPhEq, effPhEqInfo, latestCya, onReset, onReseed, syncStatus, exportCSV, counts }) {
  const upd = (k, v) => setConfig({ ...config, [k]: v === "" ? "" : Number(v) });
  const num = (id, label, k, step, extra) => h("div", { className: "field" },
    h("label", { htmlFor: id, style: extra && extra.color ? { color: extra.color } : undefined }, label),
    h("input", { id, type: "number", step, inputMode: "decimal", value: config[k] == null ? "" : config[k], placeholder: extra && extra.ph, onChange: e => upd(k, e.target.value) }),
    extra && extra.hint ? h("span", { className: "hint" }, extra.hint) : null);
  const range = (label, loK, hiK, step, color, bold) => h("div", { className: "trow" },
    h("span", { style: { color, fontWeight: bold ? 700 : 400 } }, label),
    h("input", { type: "number", step, inputMode: "decimal", "aria-label": label + " low", value: config[loK], onChange: e => upd(loK, e.target.value) }),
    h("input", { type: "number", step, inputMode: "decimal", "aria-label": label + " high", value: config[hiK], onChange: e => upd(hiK, e.target.value) }));
  const canSuggest = latestCya != null && !isNaN(latestCya) && latestCya > 0;
  const suggestFC = () => { if (!canSuggest) return; setConfig({ ...config, fcLo: Math.round(latestCya * 0.12 * 2) / 2, fcHi: Math.round(latestCya * 0.16 * 2) / 2 }); };
  const sunS = numOrDef(config.sunStart, 11), sunE = numOrDef(config.sunEnd, 17);
  const sync = { synced: ["Cloud synced", C.green], offline: ["Offline, using cached copy", C.red], connecting: ["Connecting", C.g500], local: ["Local only (this browser)", C.g500] }[syncStatus] || ["", C.g500];
  return h("div", { className: "page" },
    h(Card, null, h(CardHead, { title: "Pool" }),
      h("div", { className: "grid2" },
        h("div", { className: "field" }, h("label", { htmlFor: "s-name" }, "Name"), h("input", { id: "s-name", type: "text", value: config.name || "", placeholder: "e.g. Backyard Pool", onChange: e => setConfig({ ...config, name: e.target.value }) })),
        num("s-vol", "Volume (gal)", "volume", 1))),
    h(Card, null, h(CardHead, { title: "Dosing", sub: "container sizes used by the Home actions" }),
      h("div", { className: "grid2" },
        num("s-jug", "Chlorine pour step (fl oz)", "clStepOz", 1, { color: colorOf("fc"), ph: "64", hint: "NaOCl 10.5% is dosed in multiples of this" }),
        num("s-acid", "Acid default (fl oz)", "acidDefaultOz", 1, { color: colorOf("ph"), ph: "43", hint: `muriatic 31%; stepper offers ${acidStepsFor(config).join(" · ")}, the largest is the cap` }))),
    h(Card, null, h(CardHead, { title: "Target ranges", right: h("span", { className: "hint" }, "low · high") }),
      range("Free chlorine", "fcLo", "fcHi", 0.5, colorOf("fc"), true),
      h("div", { className: "trow sug" }, h("span", { className: "hint" }, canSuggest ? `CYA is ${fmt(latestCya, 0)} ppm → suggested FC ${fmt(latestCya * 0.12)}–${fmt(latestCya * 0.16)} (12–16% of CYA)` : "Log a CYA reading to get a chlorine range suggestion"), h("button", { type: "button", className: "btn-ghost sm", disabled: !canSuggest, onClick: suggestFC }, "Use")),
      range("pH", "phLo", "phHi", 0.1, colorOf("ph"), true),
      range("CSI", "csiLo", "csiHi", 0.1, colorOf("csi"), true),
      range("Cyanuric acid", "cyaLo", "cyaHi", 5, colorOf("cya"), false),
      range("Alkalinity", "taLo", "taHi", 10, colorOf("ta"), false),
      range("Calcium hardness", "chLo", "chHi", 10, colorOf("ch"), false)),
    h(Card, null, h(CardHead, { title: "Model" }),
      h("p", { className: "p" }, `Learned values come from your last ${numOrDef(config.lossWindow, 14)} days of readings and are used when there are 2 or more. Fallbacks apply otherwise. pH is modeled through the carbonate system: acid, bicarbonate and trichlor act on alkalinity and dissolved CO₂, and the same dose moves pH more at low alkalinity.`),
      h("div", { className: "mgrid" },
        h("span"), h("span", { className: "mh" }, "learned"), h("span", { className: "mh" }, "fallback"),
        h("label", { htmlFor: "s-rsun", style: { color: colorOf("fc"), fontWeight: 600 } }, "FC loss / day"), h("span", { className: "mv" }, learned && learned.frac != null ? `${fmt(learned.frac * 100, 0)}%` : "—"), h("input", { id: "s-rsun", type: "number", step: 0.01, inputMode: "decimal", value: config.rSun, onChange: e => upd("rSun", e.target.value) }),
        h("label", { htmlFor: "s-phk", style: { color: colorOf("ph"), fontWeight: 600 } }, "CO₂ outgassing k / day"), h("span", { className: "mv", title: learned ? `${learned.phIntervals || 0} pH intervals in window` : "" }, learned && learned.phK != null ? fmt(learned.phK, 2) : "—"), h("input", { id: "s-phk", type: "number", step: 0.05, inputMode: "decimal", value: config.phK, onChange: e => upd("phK", e.target.value) }),
        h("label", { htmlFor: "s-pheq", style: { color: colorOf("ph"), fontWeight: 600 } }, "pH equilibrium"), h("span", { className: "mv" }, effPhEqInfo.source === "override" ? "—" : fmt(effPhEq, 2)), h("input", { id: "s-pheq", type: "number", step: 0.1, inputMode: "decimal", placeholder: "auto", value: config.phEq, onChange: e => upd("phEq", e.target.value) })),
      h("p", { className: "p" }, `Model is using CO₂ outgassing k = ${fmt(effPhK, 2)}/day (${learned && learned.phK != null ? `learned from ${learned.phIntervals} pH interval${learned.phIntervals === 1 ? "" : "s"}` : "fallback; the readings in the window could not pin a rate"}).`),
      h("p", { className: "p" }, effPhEqInfo.source === "override" ? `Equilibrium is overridden to ${fmt(effPhEq, 2)}; clear the field to use the chemistry prediction.` : effPhEqInfo.source === "predicted" ? `Equilibrium ${fmt(effPhEq, 2)} is predicted from open-system carbonate chemistry at your latest TA; enter a value to override.` : `Equilibrium is the default ${fmt(effPhEq, 2)} until a reading with pH and TA exists.`),
      h("div", { className: "grid2", style: { borderTop: `1.33px solid ${C.g300}`, paddingTop: 10 } },
        num("s-win", "Learning window (days)", "lossWindow", 1),
        num("s-temp", "Default temp (°F)", "temp", 1, { hint: "used when a reading has no temp" }))),
    h(Card, null, h(CardHead, { title: "Sun window", sub: "chlorine loss is applied only between these hours" }),
      h("div", { className: "grid3" }, num("s-ss", "Start (h)", "sunStart", 0.5), num("s-se", "End (h)", "sunEnd", 0.5), num("s-sr", "Ramp (h)", "sunRamp", 0.25)),
      h("div", { className: "sunbar" }, h("div", { style: { width: `${sunS / 24 * 100}%`, background: C.g100 } }), h("div", { style: { width: `${Math.max(0, sunE - sunS) / 24 * 100}%`, background: C.gold } }), h("div", { style: { flex: 1, background: C.g100 } })),
      h("div", { className: "gauge-axis" }, h("span", null, "0:00"), h("span", null, `${sunS}:00`), h("span", null, `${sunE}:00`), h("span", null, "24:00"))),
    h(Card, null, h(CardHead, { title: "Chart" }),
      h("div", { className: "grid2" }, num("s-db", "Days back", "chartDaysBack", 1), num("s-df", "Days forward", "chartDaysFwd", 1))),
    h(Card, null, h(CardHead, { title: "Data and sync" }),
      h("div", { className: "row-between" },
        h("div", null, h("div", { className: "hist-main" }, h("span", { className: "dot", style: { background: sync[1] } }), sync[0]), h("div", { className: "hint" }, SYNC_ON ? `Supabase · ${counts.m} measurements · ${counts.d} additives` : `${counts.m} measurements · ${counts.d} additives`)),
        h("span", { className: "chip", style: { background: C.g100, color: C.ink } }, SYNC_ON ? "POOL_ID set" : "no POOL_ID")),
      h("p", { className: "p" }, "Sync keys live in the POOL_CONFIG block at the top of index.html, not in these settings. Anyone with the POOL_ID can read and write this pool."),
      h("div", { className: "grid2", style: { borderTop: `1.33px solid ${C.g300}`, paddingTop: 10 } },
        h("button", { type: "button", className: "btn-ghost", onClick: exportCSV }, "Export CSV"),
        h("button", { type: "button", className: "btn-ghost", onClick: () => { if (confirm("Replace current data with the spreadsheet seed?")) onReseed(); } }, "Reload spreadsheet")),
      h("button", { type: "button", className: "btn-danger", onClick: () => { if (confirm("Delete all measurements and additives?")) onReset(); } }, "Delete all measurements and additives")));
}

