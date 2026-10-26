import { h, useState, useMemo, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine, ResponsiveContainer } from "./react.js";
import { C } from "./theme.js";
import { Card, CardHead } from "./pieces.js";
import { splitPastFuture, SmartDot, ChemTooltip } from "./charts.js";
import { PARAMS } from "../chem/additives.js";
import { fmt, fmtVal, fmtDT, fmtMD, numOrDef, rangeOf } from "../util.js";

/* ===================== TRENDS ===================== */
export function Trends({ config, setConfig, chartSeries, series, focus, setFocus, latest, learned, effFrac, effPhK, effPhEq }) {
  const p = PARAMS.find(x => x.key === focus);
  const r = rangeOf(config, focus);
  const [pinned, setPinned] = useState(null);
  const data = useMemo(() => splitPastFuture(chartSeries, focus), [chartSeries, focus]);
  const measuredPts = chartSeries.filter(s => s._meas && s._meas[focus]);
  const back = numOrDef(config.chartDaysBack, 21);
  const setBack = d => setConfig({ ...config, chartDaysBack: d });
  const threshold = focus === "fc" ? 1 : focus === "ph" ? 7.9 : null;
  const chip = (k, big) => {
    const pp = PARAMS.find(x => x.key === k), v = latest ? latest[k] : null;
    return h("button", { key: k, type: "button", onClick: () => setFocus(k), "aria-pressed": focus === k,
      className: (big ? "pchip" : "pchip pchip-sm") + (focus === k ? " pchip-on" : ""), style: focus === k ? { borderColor: pp.color } : undefined },
      h("span", { className: "pchip-k" }, k === "fc" ? "Free Cl" : k === "ph" ? "pH" : k === "csi" ? "CSI" : k === "cya" ? "CYA" : k === "ta" ? "TA" : "CH"),
      h("span", { className: "pchip-v", style: { color: pp.color } }, fmtVal(k, v)));
  };
  const seg = (vals, cur, on) => h("div", { className: "seg", role: "group" }, vals.map(v => h("button", { key: v, type: "button", "aria-pressed": cur === v, className: cur === v ? "seg-on" : "", onClick: () => on(v) }, `${v}d`)));
  const footer = (() => {
    const isDyn = focus === "fc" && learned && learned.frac != null || focus === "ph" && learned && learned.phK != null;
    let f = "";
    if (focus === "fc") f = ` · decay ${fmt(effFrac * 100, 0)}%/day ${isDyn ? "(dynamic, from your readings)" : "(fallback; needs 2+ recent FC readings)"}`;
    if (focus === "ph") f = ` · CO₂ outgassing k=${fmt(effPhK, 2)}/day, equilibrium pH ${fmt(effPhEq, 2)} ${isDyn ? "(dynamic)" : "(fallback)"}`;
    return `${measuredPts.length} measured point${measuredPts.length === 1 ? "" : "s"} in view · ${back} days back, ${numOrDef(config.chartDaysFwd, 7)} forward${f}`;
  })();
  return h("div", { className: "page" },
    h("div", { className: "row-between" }, h("div", { className: "pchips" }, ["fc", "ph", "csi"].map(k => chip(k, true))), null),
    h("div", { className: "pchips" }, ["cya", "ta", "ch"].map(k => chip(k, false))),
    h(Card, null,
      h("div", { className: "card-head" },
        h("div", null, h("h2", { className: "card-title", style: { color: p.color } }, p.label), h("div", { className: "card-sub" }, `${p.unit || ""}${p.unit ? " · " : ""}target ${focus === "csi" ? fmtVal("csi", r.lo) + " to " + fmtVal("csi", r.hi) : r.lo + "–" + r.hi}`)),
        seg([7, 21, 60], back, setBack)),
      data.length ? h(ResponsiveContainer, { width: "100%", height: 300 },
        h(LineChart, { data, margin: { top: 8, right: 8, bottom: 4, left: -16 }, onClick: e => { if (e && e.activePayload && e.activePayload.length) setPinned(e.activePayload[0].payload); } },
          h(CartesianGrid, { stroke: C.g300, vertical: false }),
          h(XAxis, { dataKey: "t", type: "number", scale: "time", domain: ["dataMin", "dataMax"], tick: { fontSize: 11, fill: C.ink }, tickFormatter: fmtMD, minTickGap: 40 }),
          h(YAxis, { tick: { fontSize: 11, fill: C.ink }, domain: ["auto", "auto"], width: 48 }),
          h(Tooltip, { content: h(ChemTooltip, { param: p }) }),
          h(ReferenceArea, { y1: r.lo, y2: r.hi, fill: C.mint, fillOpacity: 0.35 }),
          threshold != null ? h(ReferenceLine, { y: threshold, stroke: C.red, strokeDasharray: "4 4" }) : null,
          h(ReferenceLine, { x: Date.now(), stroke: C.g500, strokeDasharray: "3 3" }),
          h(Line, { type: "monotone", dataKey: "past", stroke: p.color, strokeWidth: 2.5, connectNulls: false, isAnimationActive: false, dot: props => h(SmartDot, { ...props, color: p.color, pkey: focus, big: true }) }),
          h(Line, { type: "monotone", dataKey: "fut", stroke: p.color, strokeWidth: 2.5, strokeDasharray: "7 5", connectNulls: false, isAnimationActive: false, dot: false })))
        : h("p", { className: "p" }, "No data in this window."),
      h("div", { className: "legend" },
        h("span", null, h("i", { className: "lg-dot", style: { background: p.color } }), "measured"),
        h("span", null, h("i", { className: "lg-dot lg-hollow" }), "additive"),
        h("span", null, h("i", { className: "lg-dash", style: { borderColor: p.color } }), "forecast"),
        h("span", null, h("i", { className: "lg-band" }), "target"),
        threshold != null ? h("span", null, h("i", { className: "lg-dash", style: { borderColor: C.red } }), focus === "fc" ? "1 ppm floor" : "7.9 ceiling") : null),
      h("div", { className: "note" }, footer)),
    h(Card, null,
      h(CardHead, { title: "Selected point", sub: pinned ? `${fmtDT(pinned.t)} · ${pinned._kind === "meas" ? "measured" : pinned._kind === "dose" ? "additive" : pinned._future ? "forecast" : "modeled"}` : "tap a point on the chart to pin it here",
        right: pinned ? h("button", { type: "button", className: "btn-ghost sm", onClick: () => setPinned(null) }, "Clear") : null }),
      pinned ? h("div", { className: "pt-grid" }, PARAMS.map(pp => h("div", { key: pp.key }, h("span", null, pp.key === "fc" ? "FC" : pp.key === "ph" ? "pH" : pp.key === "csi" ? "CSI" : pp.key.toUpperCase()), h("b", { style: { color: pp.color } }, fmtVal(pp.key, pinned[pp.key]))))) : null),
    h("div", { className: "foot" }, "Measured points re-anchor the model. Additive markers show only on parameters that additive moves. Same-timestamp order: dose, then measurement."));
}

