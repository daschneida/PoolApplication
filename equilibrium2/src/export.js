import { tsOf, dateOf, todayISO } from "./chem/time.js";

export function exportCSV({ measurements, doses, series }) {
  const lines = [];
  lines.push("# POOL CHEMISTRY EXPORT  generated " + new Date().toISOString());
  lines.push("");
  lines.push("## MEASUREMENTS");
  lines.push("datetime,date,temp_F,free_chlorine_ppm,pH,cya_ppm,alkalinity_ppm,calcium_ppm");
  [...measurements].sort((a, b) => tsOf(a) - tsOf(b)).forEach(m => {
    const dt = new Date(tsOf(m)).toISOString();
    lines.push([dt, dateOf(m), m.temp ?? "", m.fc ?? "", m.ph ?? "", m.cya ?? "", m.ta ?? "", m.ch ?? ""].join(","));
  });
  lines.push("");
  lines.push("## ADDITIVES");
  lines.push("datetime,date,chemical,amount_oz");
  [...doses].sort((a, b) => tsOf(a) - tsOf(b)).forEach(d => {
    const dt = new Date(tsOf(d)).toISOString();
    lines.push([dt, dateOf(d), '"' + d.chem + '"', d.oz].join(","));
  });
  lines.push("");
  lines.push("## DAILY MODELED + MEASURED SERIES");
  lines.push("date,free_chlorine,pH,cya,alkalinity,calcium,csi,source");
  series.forEach(s => {
    const src = s._meas && Object.keys(s._meas).length ? "measured" : s._future ? "forecast" : "modeled";
    lines.push([s.date, s.fc ?? "", s.ph ?? "", s.cya ?? "", s.ta ?? "", s.ch ?? "", s.csi ?? "", src].join(","));
  });
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pool_chemistry_" + todayISO() + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}
