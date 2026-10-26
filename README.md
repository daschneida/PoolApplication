# Equilibrium by SchneiApps

Single-file, offline-capable pool chemistry manager for one 19,000-gallon pool in Houston.
Logs water tests and chemical doses, models how chemistry drifts between events, projects
current values, and sizes doses in the container increments you actually pour.

The **deployable is still one HTML file**: `docs/index.html`. GitHub Actions builds it from
`src/` and publishes it to GitHub Pages on every push, so shipping a change is just a commit.
`docs/index.html` is also kept in the repo as a ready-made copy.

## Layout

```
template/index.html   page shell: meta, icon links, the editable POOL_CONFIG block, placeholders
src/styles.css        all CSS (phone-first; colors are CSS variables)
src/chem/             pure chemistry, no React, unit-tested
  additives.js          spreadsheet coefficients (ppm·gal/oz), parameter table, container steps
  time.js               local-time helpers, second-resolution stamps, legacy noon rule
  csi.js                TroubleFreePool CSI and the TA / CH / pH bisection solvers
  sun.js                sun-day chlorine decay (user-set window)
  carbonate.js          carbonate system: K1/K2/KH/Kw, Davies corrections, acid/base/trichlor
                        dosing at constant DIC, CO2 outgassing, equilibrium pH, applyDose()
src/engine/           pure model layer built from src/chem (the old useMemo bodies)
  phEq.js               equilibrium pH source (override / predicted / default), last temperature
  learned.js            FC loss and CO2 outgassing rate learned from the owner's readings
  series.js             event timeline walk, projected "now", chart window, forecast crossings
  planner.js            house dose rules (chlorine to top of range, acid steps) and the
                        plan enumerator / simulator / scorer behind the Advisor card
src/sync.js           localStorage cache + Supabase single-row sync (reads window.POOL_CONFIG)
src/export.js         CSV export
src/ui/               React UI, written with h = React.createElement (no JSX yet)
  react.js              re-exports the vendored React / ReactDOM / Recharts globals
  app.js                state, load/save, derived model values, tap-to-log, splash
  home.js trends.js log.js advisor.js settings.js   the five tabs
  pieces.js charts.js dosebox.js theme.js          shared components and tokens
src/main.js           mounts <App>
vendor/               minified React 18.2, ReactDOM, PropTypes, Recharts (do not edit)
data/seed.json        the spreadsheet log used when no data exists yet
static/               icons and web manifest, copied beside the built page
tests/                node:test suites for chem and engine (hand-checked numbers)
build.mjs             esbuild bundle → inlined into the template → docs/index.html
```

## Working on it

```
npm install
npm run watch      # rebuilds docs/index.html on every save; open it with file:// or a static server
npm run check      # lint (no-undef catches missing imports), tests, build
```

- **Supabase keys** live only in `template/index.html` (the `POOL_CONFIG` block). They are
  copied verbatim into the build; nothing in `src/` should ever contain them.
- **Chemistry changes** go in `src/chem` with a test in `tests/`. The carbonate tests pin the
  numbers that were checked against the spreadsheet: 43 fl oz of 31 % muriatic at TA 92 is
  −0.61 pH / −9.8 ppm TA, 16 oz trichlor is −0.28, bicarb matches Henderson–Hasselbalch,
  hypochlorite leaves pH alone, equilibrium pH sits in 8.0–8.5.
- **House dosing rules** are in `src/engine/planner.js`: chlorine is the fewest pour-steps that
  reach the top of the FC range (default step 64 fl oz); acid only while pH is above the range
  high, default 43 fl oz, steps 32 · 43 · 64 plus whatever default is typed, largest is the cap.
  The planner simulates container-sized plans over the forecast horizon and scores squared
  distance outside the target ranges (1 ppm floor, pH and CSI weigh most; FC overshoot barely).
- **Vendored libraries** are plain `<script>` tags, so React is a global. `src/ui/react.js` is
  the one place that touches `window`. If you ever want JSX, esbuild already handles `.jsx`;
  rename a file and add `jsx: "automatic"` plus a React import.
- `.github/workflows/pages.yml` lints, tests, builds and deploys to GitHub Pages on every push to
  `main`, so nothing needs to be installed locally to ship a change. Pages must be set to
  "GitHub Actions" as its source (Settings → Pages).

## Model notes (short)

- FC decays by a learned daily fraction applied only inside the user's sun window
  (`sunDays`); overnight contributes nothing. CYA, TA, CH carry forward.
- pH follows the carbonate system. Acid, bicarbonate, trichlor and dichlor change alkalinity
  stoichiometrically with dissolved inorganic carbon conserved; pH is re-solved from the full
  alkalinity equation. Drift is first-order CO₂ outgassing toward 425 µatm at constant
  alkalinity; the rate `k` (1/day) is learned per interval between pH readings, skipping
  intervals no rate can explain. Equilibrium pH can be overridden in Settings.
- CSI is the TroubleFreePool form; the same cyanurate and ionic-strength terms feed the
  carbonate model so both agree on carbonate alkalinity.
- Timestamps are stored to the second; equal stamps resolve dose → measurement → model.
