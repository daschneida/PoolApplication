import { h, useState } from "./react.js";
import { C } from "./theme.js";
import { fmtDT } from "../util.js";

/* ===================== small pieces ===================== */
export function Chip({ s }) {
  return h("span", { className: "chip", style: { background: s.bg, color: s.fg } }, s.label);
}
export function Card({ accent, children, style }) {
  return h("section", { className: "card", style: { borderTop: accent ? `4px solid ${accent}` : undefined, ...(style || {}) } }, children);
}
export function CardHead({ title, sub, right }) {
  return h("div", { className: "card-head" },
    h("div", null, h("h2", { className: "card-title" }, title), sub ? h("div", { className: "card-sub" }, sub) : null),
    right || null);
}
export function Icon({ name, size = 22 }) {
  const paths = {
    home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    trends: "M3 17l6-6 4 4 8-8M15 7h6v6",
    log: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8",
    advisor: "M9 3h6v5l4 9a2 2 0 0 1-2 3H7a2 2 0 0 1-2-3l4-9zM8 14h8",
    settings: "M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M7 16v4",
    trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
    download: "M12 4v12M6 11l6 6 6-6M4 20h16"
  };
  return h("svg", { "aria-hidden": "true", width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
    h("path", { d: paths[name] || "" }));
}

/* ===================== icon + splash ===================== */
export function Mark({ size = 30 }) {
  return h("svg", { "aria-hidden": "true", className: "mark-svg", width: size, height: size, viewBox: "0 0 1024 1024", style: { display: "block", flex: `0 0 ${size}px` } },
    h("rect", { width: 1024, height: 1024, fill: C.teal }),
    h("g", { fill: "none", stroke: C.blue, strokeWidth: 26, opacity: 0.45 }, h("ellipse", { cx: 512, cy: 815, rx: 310, ry: 72 }), h("ellipse", { cx: 512, cy: 815, rx: 175, ry: 41 })),
    h("path", { d: "M512 110C512 110 300 380 300 530A212 212 0 0 0 724 530C724 380 512 110 512 110Z", fill: "#fff" }),
    h("path", { d: "M300 575C370 548 430 605 500 578C570 551 640 608 724 575L724 530A212 212 0 0 1 300 530Z", fill: C.blue }));
}
export const SPLASH_LINES = [
  "Clear water starts with one reading.",
  "Chlorine fades, pH climbs, and you keep showing up. That is the whole trick.",
  "A measured pool is a happy pool.",
  "Small doses, steady hands, sparkling water.",
  "You cannot manage what you do not measure. Good thing you are here.",
  "The sun collects its chlorine tax every afternoon. Let us look at the bill.",
  "Balanced water, zero drama.",
  "Another day, another data point. The model loves you for it.",
  "Plaster-safe and swimmer-happy. Let us keep it that way.",
  "Houston heat is no match for a good forecast.",
  "Test, dose, swim. Repeat as needed.",
  "Your water is talking. Let us listen.",
  "Nobody ever regretted checking the pH.",
  "A pour today keeps the algae away.",
  "Calm water, calm chemist.",
  "The best time to test was yesterday. The second best time is now.",
  "Precision beats guesswork, and you have both the test kit and the model.",
  "Every reading tightens the forecast.",
  "Welcome back. The pool missed you.",
  "Carbonate equilibrium is on your side today. Probably.",
  "Half-lives, drift constants and a cold drink. Living the dream.",
  "Keep the free chlorine honest and everything else gets easier.",
  "Good chemistry is just patience with numbers attached.",
  "Sparkle is a lagging indicator. Readings are a leading one."
];
export function Splash({ out, name }) {
  const [line] = useState(() => SPLASH_LINES[Math.floor(Math.random() * SPLASH_LINES.length)]);
  const hr = new Date().getHours();
  const hi = hr < 5 ? "Up late?" : hr < 12 ? "Good morning." : hr < 17 ? "Good afternoon." : "Good evening.";
  return h("div", { className: "splash" + (out ? " splash-out" : ""), "aria-hidden": out ? "true" : undefined },
    h(Mark, { size: 96 }),
    h("div", { className: "splash-name" }, "Equilibrium"),
    h("div", { className: "splash-by" }, "by SchneiApps"),
    h("div", { className: "splash-rule" }),
    h("div", { className: "splash-hi" }, `${hi}${name ? " " + name + " is loading." : ""}`),
    h("div", { className: "splash-msg" }, line),
    h("div", { className: "splash-tag" }, "Clear water, honest numbers."));
}

/* ===================== top bar + tab bar ===================== */
export function TopBar({ config, latest, syncStatus, tab }) {
  const titles = { home: null, trends: "Trends", log: "Log", advisor: "Advisor", settings: "Settings" };
  const proj = latest && latest._anchorT && latest._projectedFromHours >= 1
    ? `projected to ${fmtDT(latest.t)} from ${fmtDT(latest._anchorT)}` : null;
  const sync = { synced: ["synced", C.green], offline: ["offline, cached", C.red], connecting: ["connecting", C.g500], local: ["local only", C.g500] }[syncStatus] || ["", C.g500];
  return h("header", { className: "topbar" },
    h("div", { className: "topbar-left" },
      h(Mark, { size: 30 }),
      h("div", null,
        h("div", { className: "topbar-title" }, titles[tab] || config.name || "My Pool"),
        h("div", { className: "topbar-sub" }, titles[tab] ? `${config.name || "My Pool"} · ${Number(config.volume || 0).toLocaleString()} gal` : `${Number(config.volume || 0).toLocaleString()} gal${proj ? " · " + proj : ""}`))),
    h("div", { className: "sync" }, h("span", { className: "dot", style: { background: sync[1] } }), sync[0]));
}
export function TabBar({ tab, setTab }) {
  const tabs = [["home", "Home"], ["trends", "Trends"], ["log", "Log"], ["advisor", "Advisor"], ["settings", "Settings"]];
  return h("nav", { className: "tabbar", "aria-label": "Primary" },
    h("div", { className: "tabbar-inner" }, tabs.map(([k, l]) => h("button", {
      key: k, type: "button", onClick: () => { setTab(k); window.scrollTo(0, 0); },
      className: "tab" + (tab === k ? " tab-active" : ""), "aria-current": tab === k ? "page" : undefined
    }, h(Icon, { name: k }), l))));
}

