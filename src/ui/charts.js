import { h, useMemo, LineChart, Line, XAxis, YAxis, ReferenceArea, ReferenceLine, ResponsiveContainer } from "./react.js";
import { C } from "./theme.js";
import { MS_DAY } from "../chem/time.js";
import { fmtDT, fmtVal } from "../util.js";

/* ===================== charts ===================== */
export function splitPastFuture(data, key) {
  // two series so the forecast can be dashed; the anchor point joins them
  let lastPastIdx = -1;
  data.forEach((s, i) => { if (!s._future) lastPastIdx = i; });
  return data.map((s, i) => ({
    ...s,
    past: s._future ? null : s[key],
    fut: s._future || i === lastPastIdx ? s[key] : null
  }));
}
export function SmartDot({ cx, cy, payload, color, pkey, big }) {
  if (cx == null || cy == null || payload[pkey] == null) return null;
  const k = payload._kind;
  if (k === "meas") return h("circle", { cx, cy, r: big ? 5 : 3.5, fill: color, stroke: "#fff", strokeWidth: 1.5 });
  if (k === "dose") {
    if (payload._affects && !payload._affects[pkey]) return null;
    return h("circle", { cx, cy, r: big ? 4.5 : 3, fill: "#fff", stroke: C.choc, strokeWidth: 1.5 });
  }
  return null;
}
export function ChemTooltip({ active, payload, param }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const v = d[param.key];
  if (v == null) return null;
  const tag = d._kind === "meas" ? "measured" : d._kind === "dose" ? `additive: ${d._chem || ""}` : d._future ? "forecast" : "modeled";
  return h("div", { className: "tip" },
    h("div", { className: "tip-date" }, fmtDT(d.t)),
    h("div", { className: "tip-val", style: { color: param.color } }, fmtVal(param.key, v), " ", param.unit),
    h("div", { className: "tip-tag" }, tag));
}
export function MiniChart({ series, pkey, color, lo, hi, threshold, daysBack = 7, daysFwd = 3 }) {
  const now = Date.now();
  const data = useMemo(() => splitPastFuture(series.filter(s => s.t >= now - daysBack * MS_DAY && s.t <= now + daysFwd * MS_DAY && s[pkey] != null), pkey), [series, pkey, daysBack, daysFwd]);
  if (data.length < 2) return h("div", { className: "mini-empty" }, "Not enough recent data to draw a trend.");
  return h("div", { className: "mini" },
    h(ResponsiveContainer, { width: "100%", height: 72 },
      h(LineChart, { data, margin: { top: 4, right: 4, bottom: 4, left: 4 } },
        h(XAxis, { dataKey: "t", type: "number", domain: ["dataMin", "dataMax"], hide: true }),
        h(YAxis, { domain: ["auto", "auto"], hide: true }),
        h(ReferenceArea, { y1: lo, y2: hi, fill: C.mint, fillOpacity: 0.35 }),
        threshold != null ? h(ReferenceLine, { y: threshold, stroke: C.red, strokeDasharray: "3 3" }) : null,
        h(ReferenceLine, { x: now, stroke: C.g500, strokeDasharray: "2 3" }),
        h(Line, { type: "monotone", dataKey: "past", stroke: color, strokeWidth: 2, connectNulls: false, isAnimationActive: false, dot: p => h(SmartDot, { ...p, color, pkey }) }),
        h(Line, { type: "monotone", dataKey: "fut", stroke: color, strokeWidth: 2, strokeDasharray: "4 3", connectNulls: false, isAnimationActive: false, dot: false }))),
    h("div", { className: "mini-axis" }, h("span", null, `${daysBack} days ago`), h("span", null, "today"), h("span", null, `+${daysFwd} d`)));
}

