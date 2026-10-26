import { PARAMS } from "./chem/additives.js";

export const fmt = (n, d = 1) => n == null || isNaN(n) ? "—" : Number(n).toFixed(d);
export const numOrDef = (v, d) => v === "" || v == null || isNaN(v) ? d : Number(v);
export const rangeOf = (config, key) => {
  const def = PARAMS.find(x => x.key === key);
  return { lo: numOrDef(config[key + "Lo"], def.lo), hi: numOrDef(config[key + "Hi"], def.hi) };
};
export const fmtDT = t => {
  const d = new Date(t);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const fmtMD = t => {
  const d = new Date(t);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fmtVal = (key, v) => key === "csi" ? (v == null ? "—" : (v > 0 ? "+" : "") + fmt(v, 2).replace("-", "−")) : fmt(v, key === "ph" ? 2 : key === "fc" ? 1 : 0);
