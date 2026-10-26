import { h, useState, useMemo, React } from "./react.js";
import { C, colorOf } from "./theme.js";
import { Card, Icon } from "./pieces.js";
import { ADDITIVES } from "../chem/additives.js";
import { MS_DAY, tsOf, nowLocalDT, stampSeconds } from "../chem/time.js";
import { applyDose, bicarPHShift } from "../chem/carbonate.js";
import { fmt, fmtDT, fmtMD } from "../util.js";

/* ===================== LOG ===================== */
export function LogTab({ measurements, setMeasurements, doses, setDoses, config, latest, plan, effectOf, logDoseNow, setTab, curTemp }) {
  const [mode, setMode] = useState("meas");
  const [showAll, setShowAll] = useState(false);
  const [mForm, setMForm] = useState({ ts: nowLocalDT(), fc: "", ph: "", cya: "", ta: "", ch: "", temp: "" });
  const [dForm, setDForm] = useState({ ts: nowLocalDT(), chem: "NaOCl (10.5 wt%)", oz: "" });
  const lastWith = k => { const ms = measurements.filter(m => m[k] != null && m[k] !== "").sort((a, b) => tsOf(b) - tsOf(a)); return ms[0] || null; };
  const ago = e => { if (!e) return "no reading yet"; const d = (Date.now() - tsOf(e)) / MS_DAY; return d < 1 ? "today" : d < 2 ? "yesterday" : `${Math.floor(d)} days ago`; };
  const addMeas = () => {
    const row = { ts: stampSeconds(mForm.ts) };
    let any = false;
    ["fc", "ph", "cya", "ta", "ch", "temp"].forEach(k => { if (mForm[k] !== "") { row[k] = Number(mForm[k]); any = true; } });
    if (!any) return;
    setMeasurements(prev => [...prev.filter(m => (m.ts || m.date) !== row.ts), row]);
    setMForm({ ts: nowLocalDT(), fc: "", ph: "", cya: "", ta: "", ch: "", temp: "" });
    setTab("home");
  };
  const addDose = () => {
    if (dForm.oz === "") return;
    setDoses(prev => [...prev, { ts: stampSeconds(dForm.ts), chem: dForm.chem, oz: Number(dForm.oz) }]);
    setDForm({ ts: nowLocalDT(), chem: dForm.chem, oz: "" });
    setTab("home");
  };
  const preview = useMemo(() => {
    const a = ADDITIVES[dForm.chem]; const oz = Number(dForm.oz) || 0;
    if (!a || !oz) return null;
    const V = Number(config.volume) || 19000;
    if (latest && latest.ph != null && latest.ta != null && latest.ta > 0) {
      const n = applyDose({ fc: latest.fc, ph: latest.ph, cya: latest.cya, ta: latest.ta, ch: latest.ch, temp: curTemp }, dForm.chem, oz, V);
      return { fc: (n.fc || 0) - (latest.fc || 0), cya: (n.cya || 0) - (latest.cya || 0), ta: n.ta - latest.ta, ph: n.ph - latest.ph, ch: (n.ch || 0) - (latest.ch || 0) };
    }
    const dTA = a.TA * oz / V;
    return { fc: a.Cl * oz / V, cya: a.CYA * oz / V, ta: dTA, ph: dForm.chem === "Sodium Bicarbonate" ? bicarPHShift(dTA, 80) : a.pH * oz / V, ch: a.CH * oz / V };
  }, [dForm, config.volume, latest, curTemp]);
  const field = (id, label, k, form, setForm, extra) => h("div", { className: "field" },
    h("label", { htmlFor: id, style: extra && extra.color ? { color: extra.color, fontWeight: 700 } : undefined }, label),
    h("input", { id, type: "number", step: "any", inputMode: "decimal", value: form[k], placeholder: extra && extra.ph, onChange: e => setForm({ ...form, [k]: e.target.value }) }));
  const signed = (v, d) => v == null || Math.abs(v) < 0.0005 ? "0" : (v > 0 ? "+" : "−") + fmt(Math.abs(v), d);
  const entries = useMemo(() => {
    const all = [...measurements.map(m => ({ kind: "meas", t: tsOf(m), e: m })), ...doses.map(d => ({ kind: "dose", t: tsOf(d), e: d }))].sort((a, b) => b.t - a.t);
    return showAll ? all : all.slice(0, 8);
  }, [measurements, doses, showAll]);
  const clEff = plan.cl ? effectOf(plan.cl.chem, plan.cl.defaultOz) : null;
  const acEff = plan.acid ? effectOf(plan.acid.chem, plan.acid.defaultOz) : null;
  return h("div", { className: "page" },
    h("div", { className: "seg seg-wide", role: "group", "aria-label": "Entry type" },
      h("button", { type: "button", className: mode === "meas" ? "seg-on" : "", "aria-pressed": mode === "meas", onClick: () => setMode("meas") }, "Measurement"),
      h("button", { type: "button", className: mode === "dose" ? "seg-on" : "", "aria-pressed": mode === "dose", onClick: () => setMode("dose") }, "Additive")),
    mode === "meas" ? h(Card, null,
      h("div", { className: "field" }, h("label", { htmlFor: "m-ts" }, "Date and time"), h("input", { id: "m-ts", type: "datetime-local", value: mForm.ts, onChange: e => setMForm({ ...mForm, ts: e.target.value }) })),
      h("div", { className: "sect-k" }, "Test every few days"),
      h("div", { className: "grid2" },
        h("div", { className: "field big", style: { borderColor: colorOf("fc") } },
          h("label", { htmlFor: "m-fc", style: { color: colorOf("fc") } }, "Free chlorine"),
          h("div", { className: "big-in" }, h("input", { id: "m-fc", type: "number", step: "any", inputMode: "decimal", placeholder: "—", value: mForm.fc, onChange: e => setMForm({ ...mForm, fc: e.target.value }) }), h("span", null, "ppm")),
          h("span", { className: "hint" }, `last ${fmt(lastWith("fc") && lastWith("fc").fc)} · ${ago(lastWith("fc"))}`)),
        h("div", { className: "field big", style: { borderColor: colorOf("ph") } },
          h("label", { htmlFor: "m-ph", style: { color: colorOf("ph") } }, "pH"),
          h("div", { className: "big-in" }, h("input", { id: "m-ph", type: "number", step: "any", inputMode: "decimal", placeholder: "—", value: mForm.ph, onChange: e => setMForm({ ...mForm, ph: e.target.value }) })),
          h("span", { className: "hint" }, `last ${fmt(lastWith("ph") && lastWith("ph").ph, 2)} · ${ago(lastWith("ph"))}`))),
      field("m-temp", "Water temp (°F), used in CSI", "temp", mForm, setMForm, { ph: lastWith("temp") ? String(lastWith("temp").temp) : "" }),
      h("div", { className: "sect-k", style: { borderTop: `1.33px solid ${C.g300}`, paddingTop: 12, marginTop: 4, display: "flex", justifyContent: "space-between" } }, h("span", null, "Test monthly · blanks carry forward"), h("span", { style: { fontWeight: 400 } }, `last full test ${lastWith("cya") ? fmtMD(tsOf(lastWith("cya"))) : "—"}`)),
      h("div", { className: "grid3" },
        field("m-cya", "CYA", "cya", mForm, setMForm, { color: colorOf("cya"), ph: lastWith("cya") ? fmt(lastWith("cya").cya, 0) : "" }),
        field("m-ta", "Alkalinity", "ta", mForm, setMForm, { color: colorOf("ta"), ph: lastWith("ta") ? fmt(lastWith("ta").ta, 0) : "" }),
        field("m-ch", "Calcium", "ch", mForm, setMForm, { color: colorOf("ch"), ph: lastWith("ch") ? fmt(lastWith("ch").ch, 0) : "" })),
      h("button", { type: "button", className: "btn-primary tall", onClick: addMeas }, "Save measurement"))
    : h(Card, null,
      h("div", { className: "field" }, h("label", { htmlFor: "d-ts" }, "Date and time"), h("input", { id: "d-ts", type: "datetime-local", value: dForm.ts, onChange: e => setDForm({ ...dForm, ts: e.target.value }) })),
      h("div", { className: "grid2" },
        h("div", { className: "field" }, h("label", { htmlFor: "d-chem" }, "Chemical"), h("select", { id: "d-chem", value: dForm.chem, onChange: e => setDForm({ ...dForm, chem: e.target.value }) }, Object.keys(ADDITIVES).map(k => h("option", { key: k, value: k }, k)))),
        h("div", { className: "field" }, h("label", { htmlFor: "d-oz" }, `Amount (${ADDITIVES[dForm.chem].unit})`), h("input", { id: "d-oz", type: "number", step: "any", inputMode: "decimal", value: dForm.oz, onChange: e => setDForm({ ...dForm, oz: e.target.value }) }))),
      h("div", { className: "preview" },
        h("div", { className: "sect-k" }, `Expected effect at ${Number(config.volume || 0).toLocaleString()} gal`),
        preview ? h("div", { className: "grid5" },
          [["FC", preview.fc, latest && latest.fc, 2, colorOf("fc")], ["pH", preview.ph, latest && latest.ph, 2, colorOf("ph")], ["CYA", preview.cya, latest && latest.cya, 0, colorOf("cya")], ["TA", preview.ta, latest && latest.ta, 0, colorOf("ta")], ["CH", preview.ch, latest && latest.ch, 0, colorOf("ch")]].map(([l, d, cur, dec, col]) =>
            h("div", { key: l }, h("span", null, l), h("b", { style: { color: Math.abs(d) >= 0.0005 ? col : C.ink } }, signed(d, dec)), cur != null && Math.abs(d) >= 0.0005 ? h("span", null, `→ ${fmt(cur + d, dec)}`) : null)))
          : h("div", { className: "hint" }, "Enter an amount to preview.")),
      h("button", { type: "button", className: "btn-primary tall", onClick: addDose }, "Save additive")),

    (plan.cl || plan.acid) ? h("section", { className: "suggest" },
      h("div", { className: "row-between" }, h("h2", { className: "card-title" }, "Suggested today"), h("span", { className: "hint" }, "container sizes · from Home")),
      plan.cl && clEff ? h("div", { className: "sug-row" },
        h("div", null, h("b", null, `${plan.cl.defaultOz} fl oz ${plan.cl.chem}`), h("div", { className: "hint" }, `FC ${fmt(latest.fc)} → ${fmt(clEff.fc)} ppm`)),
        h("button", { type: "button", className: "btn-ghost", onClick: () => logDoseNow(plan.cl.chem, plan.cl.defaultOz) }, "Log as added")) : null,
      plan.acid && acEff ? h("div", { className: "sug-row" },
        h("div", null, h("b", null, `${plan.acid.defaultOz} fl oz ${plan.acid.chem}`), h("div", { className: "hint" }, `pH ${fmt(latest.ph, 2)} → ${fmt(acEff.ph, 2)}${acEff.ta != null ? ` · TA ${fmt(latest.ta, 0)} → ${fmt(acEff.ta, 0)}` : ""}`)),
        h("button", { type: "button", className: "btn-ghost", onClick: () => logDoseNow(plan.acid.chem, plan.acid.defaultOz) }, "Log as added")) : null) : null,

    h("section", null,
      h("div", { className: "row-between rule" }, h("h2", { className: "card-title" }, showAll ? "History" : "Recent"), h("span", { className: "hint" }, `${measurements.length} measurements · ${doses.length} additives`)),
      entries.map((x, i) => h("div", { key: x.kind + x.t + i, className: "hist-row", style: { background: i % 2 ? C.g100 : C.white } },
        h("div", null,
          x.kind === "meas"
            ? h(React.Fragment, null,
              h("div", { className: "hist-main" }, h("i", { className: "lg-dot", style: { background: colorOf("fc") } }), [x.e.fc != null ? `FC ${fmt(x.e.fc)}` : null, x.e.ph != null ? `pH ${fmt(x.e.ph, 2)}` : null, x.e.temp != null ? `${fmt(x.e.temp, 0)}°` : null].filter(Boolean).join(" · ") || "measurement"),
              h("div", { className: "hint" }, fmtDT(x.t), [x.e.cya != null ? `CYA ${fmt(x.e.cya, 0)}` : null, x.e.ta != null ? `TA ${fmt(x.e.ta, 0)}` : null, x.e.ch != null ? `CH ${fmt(x.e.ch, 0)}` : null].filter(Boolean).map(s => " · " + s).join("")))
            : h(React.Fragment, null,
              h("div", { className: "hist-main" }, h("i", { className: "lg-dot lg-hollow" }), `${x.e.oz} ${(ADDITIVES[x.e.chem] || {}).unit || "oz"} ${x.e.chem}`),
              h("div", { className: "hint" }, fmtDT(x.t), ADDITIVES[x.e.chem] ? `${ADDITIVES[x.e.chem].Cl ? ` · FC ${signed(ADDITIVES[x.e.chem].Cl * x.e.oz / config.volume, 1)}` : ""}${ADDITIVES[x.e.chem].pH ? ` · pH ${signed(ADDITIVES[x.e.chem].pH * x.e.oz / config.volume, 2)}` : ""}${ADDITIVES[x.e.chem].TA ? ` · TA ${signed(ADDITIVES[x.e.chem].TA * x.e.oz / config.volume, 0)}` : ""}` : ""))),
        h("button", { type: "button", className: "icon-btn", "aria-label": `Delete entry from ${fmtDT(x.t)}`, onClick: () => {
          if (!confirm("Delete this entry?")) return;
          if (x.kind === "meas") setMeasurements(measurements.filter(m => m !== x.e)); else setDoses(doses.filter(d => d !== x.e));
        } }, h(Icon, { name: "trash", size: 16 })))),
      h("button", { type: "button", className: "btn-ghost full", onClick: () => setShowAll(v => !v) }, showAll ? "Show recent only" : "Full history")));
}

