# Equilibrium by SchneiApps — guidance for Claude Code

Phone-first pool chemistry app for one 19,000-gal pool in Houston. Deployed as a single
`docs/index.html` on GitHub Pages, built from the ESM source tree in `src/` by esbuild.
Read `README.md` for the layout and `PROJECT.md` for the full context before changing anything.

## Commands

- `npm install` once; then `npm run check` (lint → tests → build) before every commit.
- `npm run watch` rebuilds `docs/index.html` on save; open it with `file://` or a static server.
- `npm test` runs `tests/*.test.mjs` with node:test. Tests pin hand-checked chemistry numbers.
- Pushing to `main` triggers `.github/workflows/pages.yml`, which lints, tests, builds and deploys.
  Commit `docs/index.html` too; it is the ready-made copy.

## Hard rules

- `template/index.html` holds the real Supabase keys in `POOL_CONFIG`. Never move, duplicate or
  reformat that block, and never put keys anywhere in `src/`.
- Do not edit anything in `vendor/` (minified React 18.2, ReactDOM, PropTypes, Recharts).
- Keep the data model and storage compatible: measurements use `.ts` (seconds precision) or
  legacy `.date`; doses use `chem`/`oz`; localStorage key is `pool_chem_webapp_v1`; Supabase is
  one row per `POOL_ID` holding the whole blob. Existing data must keep loading.
- Keep the deployable a single self-contained HTML file. No external network fetches at runtime
  other than Supabase. No frameworks beyond the vendored React/Recharts.
- `src/ui/react.js` is the only module that touches `window`. UI uses `h = React.createElement`
  (no JSX today; esbuild can handle `.jsx` if a file is converted deliberately).
- `build.mjs` uses function replacers in `String.replace` because minified code contains `$&`
  sequences; keep that, and keep the script-tag balance assertion.

## Chemistry and model conventions

- Additive coefficients are ppm·gal per unit (owner's spreadsheet) in `src/chem/additives.js`.
  User-defined additives come from `config.customAdditives` as ppm per unit per 10,000 gal.
- pH goes through the carbonate system (`src/chem/carbonate.js`): acid, bicarbonate, trichlor,
  dichlor and cyanuric acid change total alkalinity / DIC / CYA and pH is re-solved; drift is
  first-order CO2 outgassing at constant alkalinity. Do not reintroduce linear pH coefficients.
- `src/engine/learned.js` fits the outgassing rate and an effective equilibrium pH jointly, with
  a 0.2 kit-resolution deadband, a Huber/capped loss, and mild priors. Any change here needs a
  test in `tests/learned.test.mjs` and a check against `data/seed.json` (expect k ≈ 0.2–0.4/day).
- FC decay is a learned daily fraction applied only inside the user's sun window. Rain, fill and
  dilution are intentionally not modeled.
- CSI is the TroubleFreePool form in `src/chem/csi.js`; its cyanurate and ionic-strength terms are
  shared with the carbonate model so both agree on carbonate alkalinity.

## House dosing rules (owner's; do not change without asking)

- Chlorine (NaOCl 10.5 %): fewest `clStepOz` (64 fl oz) pours that put FC at or just over the
  top of the FC range. Suggested when FC is below range or the forecast crosses the low bound
  inside the chart window. Overshoot is accepted. Containers are 2.5 gal but the app shows fl oz.
- Acid (31 % muriatic): only while pH is above the range high. Default `acidDefaultOz` (43),
  steps 32 · 43 · 64 plus the typed default; the largest is the per-dose cap.
- Home "Added, log it" writes the dose immediately, stamped to the second, with an Undo toast.
- The planner (`src/engine/planner.js`) may prefer another acid step and must say why on the card.

## UI conventions

- Tabs in priority order: Home (FC → pH → CSI → long-term), Trends, Log, Advisor, Settings.
- Palette "Aqua pop": accent cyan `#06b6d4`, primary navy `#1e3a8a`, parameter colors in
  `src/ui/theme.js`; CSS variables in `src/styles.css`. Do not use Crystaphase brand colors.
- Minimum tap target 44 px; body text 13–15 px; the whole app must read well at 390 px wide.

## Working style the owner wants

- Lead with the conclusion. Honest about model limits; cite real chemistry; verify numbers with
  a quick node script or a test rather than asserting them.
- Ask before changing a house rule or the data model; otherwise make the change, run
  `npm run check`, and summarize what changed and what was verified.
