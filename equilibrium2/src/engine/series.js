import { MS_DAY, HOUR, tsOf, toLocalISO } from "../chem/time.js";
import { ADDITIVES } from "../chem/additives.js";
import { csi } from "../chem/csi.js";
import { sunDays } from "../chem/sun.js";
import { applyDose, outgasPH, HOCL_ACID_EQ } from "../chem/carbonate.js";

// The merged event timeline (measurements, doses, model checkpoints) walked with decay and drift.
export function computeSeries({ measurements, doses, config, effFrac, effPhK, effPhEq, phEqOverride }) {
  const have = measurements.filter(m => m.fc != null || m.ph != null);
  if (!have.length) return [];
  const sorted = [...measurements].sort((a, b) => tsOf(a) - tsOf(b));
  const startTs = tsOf(sorted[0]);
  const lastTs = tsOf(sorted[sorted.length - 1]);
  const endTs = Math.max(lastTs, Date.now() + (config.chartDaysFwd || 7) * MS_DAY);

  // ---- build the event timeline: measurements, additives, and 6 PM modeled checkpoints ----
  const events = [];
  sorted.forEach(m => events.push({
    t: tsOf(m),
    kind: "meas",
    data: m
  }));
  doses.forEach(d => events.push({
    t: tsOf(d),
    kind: "dose",
    data: d
  }));
  // 6 PM checkpoints (one per day) so the chart has a daily modeled cadence.
  const checkpoints = [];
  const firstDay = new Date(startTs);
  firstDay.setHours(0, 0, 0, 0);
  for (let t = firstDay.getTime(); t <= endTs + MS_DAY; t += MS_DAY) {
    const six = new Date(t); six.setHours(18, 0, 0, 0);
    checkpoints.push(six.getTime());
  }
  // Pre-sun and post-sun checkpoints to give the chart its stair-step appearance.
  // Bounded to the visible chart window only (default ~28 days = ~56 extra points)
  // so we never iterate full history. Each checkpoint is just a state-sampling point;
  // the decay math is the same sun-day model from step 3.
  const sunStartH = Number(config.sunStart);
  const sunEndH = Number(config.sunEnd);
  if (isFinite(sunStartH) && isFinite(sunEndH) && sunEndH > sunStartH) {
    const nowMs = Date.now();
    const winLo = nowMs - (+config.chartDaysBack || 21) * MS_DAY;
    const winHi = nowMs + (+config.chartDaysFwd || 7) * MS_DAY;
    const windowFirstDay = new Date(Math.max(winLo, startTs));
    windowFirstDay.setHours(0, 0, 0, 0);
    const windowLastDay = Math.min(winHi, endTs + MS_DAY);
    for (let t = windowFirstDay.getTime(); t <= windowLastDay; t += MS_DAY) {
      const day = new Date(t); day.setHours(0, 0, 0, 0);
      // pre-sun: 5 min before sunStart
      const pre = day.getTime() + sunStartH * 3600000 - 5 * 60000;
      if (pre >= winLo && pre <= winHi) checkpoints.push(pre);
      // post-sun: 5 min after sunEnd
      const post = day.getTime() + sunEndH * 3600000 + 5 * 60000;
      if (post >= winLo && post <= winHi) checkpoints.push(post);
    }
  }
  checkpoints.forEach(t => events.push({ t, kind: "model" }));
  // Tie-break at equal timestamps: dose BEFORE measurement BEFORE model checkpoint.
  // This matches the common "I dosed, then tested" workflow where a same-day measurement
  // reflects the post-dose chlorine level and shouldn't get the dose stacked on top.
  events.sort((a, b) => a.t - b.t || {
    dose: 0,
    meas: 1,
    model: 2
  }[a.kind] - {
    dose: 0,
    meas: 1,
    model: 2
  }[b.kind]);

  // ---- walk the timeline applying decay/drift, measurements, and doses ----
  const out = [];
  let st = {
    fc: null,
    ph: null,
    cya: null,
    ta: null,
    ch: null,
    temp: null
  };
  let lastT = null;
  const T = config.temp;
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const applyDecayUntil = t => {
    if (lastT == null) {
      lastT = t;
      return;
    }
    const days = (t - lastT) / MS_DAY;
    if (days > 0) {
      // FC: sun-day decay (overnight contributes ~0; loss happens during sun window)
      if (st.fc != null) {
        const sd = sunDays(lastT, t, config.sunStart, config.sunEnd);
        st.fc = Math.max(0, st.fc * Math.pow(1 - effFrac, sd));
      }
      if (st.ph != null) {
        // pH: CO2 outgassing toward atmospheric equilibrium at constant alkalinity, on
        // calendar days (24/7 process). Falls back to a plain exponential if TA is unknown.
        if (st.ta != null && st.ta > 0) st.ph = outgasPH(st.ph, st.ta, st.cya || 0, days, effPhK, st.temp != null ? st.temp : T, st.ch, phEqOverride);
        else st.ph = effPhEq - (effPhEq - st.ph) * Math.exp(-effPhK * days);
      }
    }
    lastT = t;
  };
  events.forEach(ev => {
    applyDecayUntil(ev.t);
    let mf = {},
      hasDose = false,
      kind = ev.kind;
    if (ev.kind === "meas") {
      const m = ev.data;
      ["fc", "ph", "cya", "ta", "ch"].forEach(k => {
        if (m[k] != null && m[k] !== "") {
          st[k] = Number(m[k]);
          mf[k] = true;
        }
      });
      if (m.temp != null && m.temp !== "") st.temp = Number(m.temp);
      // Skip emitting a point if this measurement has none of the tracked params
      if (!Object.keys(mf).length) return;
    } else if (ev.kind === "dose") {
      const d = ev.data;
      const a = ADDITIVES[d.chem];
      if (!a) return;
      // All dose chemistry lives in applyDose: FC/CYA/CH from the spreadsheet
      // coefficients, TA and pH through the carbonate system.
      const before = { ...st };
      const after = applyDose(st, d.chem, d.oz, config.volume);
      st.fc = after.fc; st.ph = after.ph; st.cya = after.cya; st.ta = after.ta; st.ch = after.ch;
      const moved = k => before[k] == null ? after[k] != null : after[k] != null && Math.abs(after[k] - before[k]) > 1e-9;
      const affects = {
        fc: a.Cl !== 0,
        cya: a.CYA !== 0,
        ta: a.TA !== 0 || !!HOCL_ACID_EQ[d.chem],
        ch: a.CH !== 0,
        ph: moved("ph") || a.pH !== 0 || d.chem === "Sodium Bicarbonate"
      };
      affects.csi = affects.ph || affects.ta || affects.ch || affects.cya;
      hasDose = true;
      ev._affects = affects;
      ev._chem = d.chem;
    }
    // For "model" events, no state change — just emit a point at the current state.

    // Emit a point if we have state to plot
    if (st.fc == null && st.ph == null && st.cya == null && st.ta == null && st.ch == null) return;
    const cv = csi(st.ph, st.ch, st.ta, st.cya, ev.data && ev.data.temp || T);
    out.push({
      t: ev.t,
      date: toLocalISO(new Date(ev.t)),
      fc: st.fc == null ? null : +st.fc.toFixed(2),
      ph: st.ph == null ? null : +st.ph.toFixed(2),
      cya: st.cya == null ? null : +st.cya.toFixed(1),
      ta: st.ta == null ? null : +st.ta.toFixed(1),
      ch: st.ch == null ? null : +st.ch.toFixed(1),
      csi: cv == null ? null : +cv.toFixed(2),
      _kind: kind,
      // "meas" | "dose" | "model"
      _meas: kind === "meas" ? mf : {},
      _hasDose: hasDose,
      _affects: ev._affects || null,
      _chem: ev._chem || null,
      _future: ev.t > Date.now()
    });
  });
  return out;
}

// State projected from the last past event to now (nearest hour).
export function computeLatest({ series, config, effFrac, effPhK, effPhEq, phEqOverride, lastTemp }) {
  if (!series.length) return null;
  // Anchor at the most recent past event (measurement or additive).
  const past = series.filter(s => !s._future);
  const anchor = past.length ? past[past.length - 1] : series[0];
  // Project the model forward from that anchor to "now" rounded to the nearest hour.
  const nowHour = Math.round(Date.now() / HOUR) * HOUR;
  if (nowHour <= anchor.t) return anchor; // anchor is in the future / right now
  const days = (nowHour - anchor.t) / MS_DAY;
  // FC: fractional decay over sun-equivalent days (overnight contributes ~0; loss happens
  // when the sun is up). pH still uses calendar days because outgassing is a 24/7 process.
  const sd = sunDays(anchor.t, nowHour, config.sunStart, config.sunEnd);
  const fc = anchor.fc == null ? null : Math.max(0, anchor.fc * Math.pow(1 - effFrac, sd));
  // pH: drift toward equilibrium
  const phEq = effPhEq;
  const ph = anchor.ph == null ? null : anchor.ta != null && anchor.ta > 0 ? outgasPH(anchor.ph, anchor.ta, anchor.cya || 0, days, effPhK, lastTemp, anchor.ch, phEqOverride) : phEq - (phEq - anchor.ph) * Math.exp(-effPhK * days);
  // CYA, TA, CH don't drift between events — carry forward
  const cya = anchor.cya,
    ta = anchor.ta,
    ch = anchor.ch;
  const cv = csi(ph, ch, ta, cya, config.temp);
  return {
    t: nowHour,
    date: toLocalISO(new Date(nowHour)),
    fc: fc == null ? null : +fc.toFixed(2),
    ph: ph == null ? null : +ph.toFixed(2),
    cya: cya == null ? null : +(+cya).toFixed(1),
    ta: ta == null ? null : +(+ta).toFixed(1),
    ch: ch == null ? null : +(+ch).toFixed(1),
    csi: cv == null ? null : +cv.toFixed(2),
    _kind: "model",
    _projectedFromHours: (nowHour - anchor.t) / HOUR,
    _anchorT: anchor.t
  };
}

export function computeChartSeries({ series, config }) {
  if (!series.length) return series;
  const back = config.chartDaysBack === "" ? 21 : Number(config.chartDaysBack);
  const fwd = config.chartDaysFwd === "" ? 7 : Number(config.chartDaysFwd);
  const now = Date.now();
  const lo = now - back * MS_DAY,
    hi = now + fwd * MS_DAY;
  const win = series.filter(s => s.t >= lo && s.t <= hi);
  return win.length ? win : series; // fall back to full if window misses all data
}

// First forward crossings of FC < 1 ppm and pH > 7.9.
export function computeForecast({ series }) {
  if (!series.length) return null;
  // Anchor at the last non-future point (today's most recent event).
  let startIdx = -1;
  for (let i = series.length - 1; i >= 0; i--) {
    if (!series[i]._future) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) startIdx = 0;
  const startT = series[startIdx].t;
  const daysFrom = t => Math.max(0, Math.round((t - startT) / MS_DAY));
  let fcBelow1 = null,
    phAbove = null;
  const phLimit = 7.9;
  // Only scan forward; ignore historical crossings.
  for (let i = startIdx + 1; i < series.length; i++) {
    const s = series[i];
    if (fcBelow1 == null && s.fc != null && s.fc < 1) {
      fcBelow1 = {
        days: daysFrom(s.t),
        date: s.date
      };
    }
    if (phAbove == null && s.ph != null && s.ph > phLimit) {
      phAbove = {
        days: daysFrom(s.t),
        date: s.date
      };
    }
    if (fcBelow1 && phAbove) break;
  }
  return {
    fcBelow1,
    phAbove,
    phLimit
  };
}

