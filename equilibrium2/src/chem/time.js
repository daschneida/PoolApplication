export const MS_DAY = 86400000;
export const HOUR = 3600000;
// Local-time date string (YYYY-MM-DD). Using local avoids the UTC rollover bug where
// evenings in US time zones read as "tomorrow" because toISOString() is UTC.
export const toLocalISO = d => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
export const todayISO = () => toLocalISO(new Date());
// datetime-local value (YYYY-MM-DDTHH:MM) in local time, for the form default.
export const nowLocalDT = () => {
  const x = new Date();
  return `${toLocalISO(x)}T${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
};
// Same, to the second. Used for tap-to-log doses so entries seconds apart keep their order.
export const nowLocalDTs = () => {
  const x = new Date();
  return `${nowLocalDT()}:${String(x.getSeconds()).padStart(2, "0")}`;
};
// A form timestamp (minute resolution) becomes second-resolution on save: if it is still
// the current minute, stamp the current seconds; otherwise append :00.
export const stampSeconds = ts => {
  if (!ts || ts.length !== 16) return ts;
  return ts === nowLocalDT() ? nowLocalDTs() : ts + ":00";
};
// Millisecond timestamp for any entry. New entries carry .ts (ISO datetime-local string,
// interpreted as local time). Legacy entries have only .date (YYYY-MM-DD) → treat as noon local
// so they sit neutrally within the day and don't shift relative ordering.
export const tsOf = e => {
  if (e.ts) {
    const t = new Date(e.ts).getTime();
    if (!isNaN(t)) return t;
  }
  if (e.date) {
    const t = new Date(e.date + "T12:00").getTime();
    if (!isNaN(t)) return t;
  }
  return NaN;
};
// The local date string an entry belongs to (for the daily series / chart).
export const dateOf = e => e.ts ? toLocalISO(new Date(e.ts)) : e.date;
