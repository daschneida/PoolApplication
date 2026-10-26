import { h, useState, useEffect, useMemo } from "./react.js";
import { Splash, TopBar, TabBar } from "./pieces.js";
import { Home } from "./home.js";
import { Trends } from "./trends.js";
import { LogTab } from "./log.js";
import { Advisor } from "./advisor.js";
import { Settings } from "./settings.js";
import { ADDITIVES } from "../chem/additives.js";
import { MS_DAY, tsOf, nowLocalDTs } from "../chem/time.js";
import { csi } from "../chem/csi.js";
import { sunDays } from "../chem/sun.js";
import { applyDose, outgasPH } from "../chem/carbonate.js";
import { computePhEqInfo, computeLastTemp } from "../engine/phEq.js";
import { computeLearned } from "../engine/learned.js";
import { computeSeries, computeLatest, computeChartSeries, computeForecast } from "../engine/series.js";
import { computePlan, computeAdvice } from "../engine/planner.js";
import { exportCSV as exportCSVFile } from "../export.js";
import { LS_KEY, SYNC_ON, sbLoad, sbSave } from "../sync.js";
import SEED from "../../data/seed.json";

export function App() {
  const [config, setConfig] = useState({
    name: "Houston Pool",
    volume: 19000,
    temp: 85,
    rSun: 0.45,
    demand: 1.2,
    phEq: "",
    phK: 0.55,
    chartDaysBack: 21,
    chartDaysFwd: 7,
    lossWindow: 14,
    fcLo: 2,
    fcHi: 6,
    phLo: 7.4,
    phHi: 7.8,
    cyaLo: 40,
    cyaHi: 60,
    taLo: 80,
    taHi: 120,
    chLo: 200,
    chHi: 400,
    csiLo: -0.3,
    csiHi: 0.3,
    sunStart: 11,
    sunEnd: 17,
    sunRamp: 1,
    clStepOz: 64,
    acidDefaultOz: 43
  });
  const [measurements, setMeasurements] = useState([]);
  const [doses, setDoses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("home");
  const [focus, setFocus] = useState("fc");
  const [syncStatus, setSyncStatus] = useState(SYNC_ON ? "connecting" : "local");

  // load: try Supabase first (if configured), fall back to localStorage, then seed
  useEffect(() => {
    (async () => {
      // local cache first so the UI isn't empty while the network call runs
      let usedLocal = false;
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const d = JSON.parse(raw);
          if (d.config) setConfig(c => ({
            ...c,
            ...d.config
          }));
          setMeasurements(d.measurements || []);
          setDoses(d.doses || []);
          usedLocal = true;
        }
      } catch (e) {}
      if (SYNC_ON) {
        try {
          const cloud = await sbLoad();
          if (cloud) {
            if (cloud.config) setConfig(c => ({
              ...c,
              ...cloud.config
            }));
            setMeasurements(cloud.measurements || []);
            setDoses(cloud.doses || []);
            setSyncStatus("synced");
          } else {
            // first time on this pool ID: seed cloud from local or spreadsheet
            const seedM = usedLocal ? undefined : SEED.measurements;
            const seedD = usedLocal ? undefined : SEED.doses;
            if (!usedLocal) {
              setMeasurements(SEED.measurements);
              setDoses(SEED.doses);
            }
            setSyncStatus("synced");
          }
        } catch (e) {
          setSyncStatus("offline");
          if (!usedLocal) {
            setMeasurements(SEED.measurements);
            setDoses(SEED.doses);
          }
        }
      } else if (!usedLocal) {
        setMeasurements(SEED.measurements);
        setDoses(SEED.doses);
      }
      setLoaded(true);
    })();
  }, []);

  // save: always cache locally; if sync on, also push to Supabase (debounced)
  useEffect(() => {
    if (!loaded) return;
    const state = {
      config,
      measurements,
      doses
    };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {}
    if (SYNC_ON) {
      const id = setTimeout(async () => {
        try {
          await sbSave(state);
          setSyncStatus("synced");
        } catch (e) {
          setSyncStatus("offline");
        }
      }, 800);
      return () => clearTimeout(id);
    }
  }, [config, measurements, doses, loaded]);
  // pH equilibrium: manual override if set, else predicted from chemistry of latest reading.
  const effPhEqInfo = useMemo(() => computePhEqInfo({ config, measurements }), [config.phEq, config.temp, measurements]);
  const phEqManual = effPhEqInfo.source === "override" ? effPhEqInfo.value : null;
  const lastTemp = useMemo(() => computeLastTemp({ measurements, config }), [measurements, config.temp]);

  const learned = useMemo(() => computeLearned({ measurements, doses, config, effPhEq: effPhEqInfo.value, phEqOverride: phEqManual }), [measurements, doses, config.volume, config.lossWindow, config.temp, effPhEqInfo.value, phEqManual]);
  // Equilibrium pH the model drifts toward: manual override, else the fitted value when the
  // readings say the pool plateaus below the atmospheric prediction, else the prediction.
  const phEqOverride = phEqManual != null ? phEqManual : learned && Number.isFinite(learned.phEqFit) ? learned.phEqFit : null;
  const effPhEq = phEqOverride != null ? phEqOverride : effPhEqInfo.value;
  const effPhEqSource = phEqManual != null ? "override" : learned && Number.isFinite(learned.phEqFit) ? "learned" : effPhEqInfo.source;

  // Forecast parameters: dynamic when available, else the Settings fallback.
  // Effective model parameters: learned when finite, else the Settings fallback. Never NaN,
  // because a NaN rate silently turns every drift step into "no change".
  const effFrac = learned && Number.isFinite(learned.frac) ? learned.frac : Number(config.rSun) || 0.45;
  const effPhK = learned && Number.isFinite(learned.phK) ? learned.phK : Number(config.phK) || 0.55;
  const series = useMemo(() => computeSeries({ measurements, doses, config, effFrac, effPhK, effPhEq, phEqOverride }), [measurements, doses, config, effFrac, effPhK, effPhEq, phEqOverride]);

  // "latest" = the current day's row (today), which now includes any measurement + additive
  // contributions applied for today. If today is beyond the series, fall back to the last row.
  const latest = useMemo(() => computeLatest({ series, config, effFrac, effPhK, effPhEq, phEqOverride, lastTemp }), [series, effFrac, effPhK, effPhEq, phEqOverride, lastTemp, config.temp, config.sunStart, config.sunEnd]);

  // Chart display window: [today - chartDaysBack, today + chartDaysFwd], clamped to available data.
  const chartSeries = useMemo(() => computeChartSeries({ series, config }), [series, config.chartDaysBack, config.chartDaysFwd]);
  const forecast = useMemo(() => computeForecast({ series }), [series]);
  const exportCSV = () => exportCSVFile({ measurements, doses, series });
  const curTemp = lastTemp;
  const plan = useMemo(() => computePlan({ latest, series, config }), [latest, series, config]);

  // ---------- advice: the best container-sized plan over the forecast horizon ----------
  const advice = useMemo(() => computeAdvice({ latest, plan, config, effFrac, effPhK, effPhEq, phEqOverride, lastTemp }), [latest, plan, config, effFrac, effPhK, effPhEq, phEqOverride, lastTemp]);

  // Write a dose now (timestamped to the second) and offer an undo.
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(id);
  }, [toast]);
  const logDoseNow = (chem, oz) => {
    const row = { ts: nowLocalDTs(), chem, oz: Number(oz) };
    setDoses(prev => [...prev, row]);
    setToast({
      msg: `Logged ${oz} ${ADDITIVES[chem].unit} ${chem}`,
      undo: () => setDoses(prev => {
        const i = prev.lastIndexOf(row);
        if (i < 0) return prev.filter(d => !(d.ts === row.ts && d.chem === row.chem && d.oz === row.oz));
        const next = prev.slice();
        next.splice(i, 1);
        return next;
      })
    });
  };

  // Effect of a hypothetical dose from the projected-now state.
  const effectOf = (chem, oz) => {
    if (!latest) return null;
    const n = applyDose({ fc: latest.fc, ph: latest.ph, cya: latest.cya, ta: latest.ta, ch: latest.ch, temp: curTemp }, chem, oz, Number(config.volume) || 19000);
    const csiNow = csi(n.ph, n.ch, n.ta, n.cya, curTemp);
    // one calendar day of CO2 outgassing, one sun-day of FC decay
    const ph1 = n.ph == null ? null : n.ta != null && n.ta > 0 ? outgasPH(n.ph, n.ta, n.cya || 0, 1, effPhK, curTemp, n.ch, phEqOverride) : effPhEq - (effPhEq - n.ph) * Math.exp(-effPhK);
    const sd1 = sunDays(Date.now(), Date.now() + MS_DAY, config.sunStart, config.sunEnd);
    const fc1 = n.fc == null ? null : Math.max(0, n.fc * Math.pow(1 - effFrac, sd1));
    const csi1 = csi(ph1, n.ch, n.ta, n.cya, curTemp);
    return { fc: n.fc, ph: n.ph, ta: n.ta, ch: n.ch, cya: n.cya, csiNow, ph1, fc1, csi1 };
  };

  const lastMeasTs = measurements.length ? Math.max(...measurements.map(tsOf)) : null;

  // Splash: shown while loading and for a moment after, then fades out.
  const [splash, setSplash] = useState({ show: true, out: false });
  useEffect(() => {
    if (!loaded) return;
    const a = setTimeout(() => setSplash({ show: true, out: true }), 1400);
    const b = setTimeout(() => setSplash({ show: false, out: true }), 1900);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [loaded]);
  if (!loaded) return h(Splash, { out: false, name: config.name });

  const effPhEqView = { value: effPhEq, source: effPhEqSource, predicted: effPhEqInfo.value };
  const shared = { config, latest, series, chartSeries, forecast, learned, effFrac, effPhK, effPhEq, effPhEqInfo: effPhEqView, plan, advice, effectOf, logDoseNow, curTemp, lastMeasTs, setTab, setFocus, focus };

  return h("div", { className: "app" },
    h(TopBar, { config, latest, syncStatus, tab }),
    tab === "home" && h(Home, shared),
    tab === "trends" && h(Trends, { ...shared, setConfig }),
    tab === "log" && h(LogTab, { ...shared, measurements, setMeasurements, doses, setDoses }),
    tab === "advisor" && h(Advisor, { measurements, latest, config, learned, effFrac, plan, advice, effectOf, logDoseNow, curTemp, effPhEq, effPhK }),
    tab === "settings" && h(Settings, {
      config, setConfig, learned, effPhK, effPhEq, effPhEqInfo: effPhEqView, syncStatus, exportCSV,
      latestCya: latest ? latest.cya : null,
      counts: { m: measurements.length, d: doses.length },
      onReset: () => { setMeasurements([]); setDoses([]); },
      onReseed: () => { setMeasurements(SEED.measurements); setDoses(SEED.doses); }
    }),
    toast && h("div", { className: "toast", role: "status" },
      h("span", null, toast.msg),
      h("button", { type: "button", className: "toast-undo", onClick: () => { toast.undo(); setToast(null); } }, "Undo")
    ),
    h(TabBar, { tab, setTab }),
    splash.show ? h(Splash, { out: splash.out, name: config.name }) : null
  );
}

