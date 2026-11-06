# Project Definition Prompt: Equilibrium (pool chemistry manager)

Paste this at the start of a future session to load context.

**What it is.** Phone-first, offline-capable pool chemistry app for one 19,000-gal pool in Houston,
branded Equilibrium by SchneiApps. Deployed as a single `docs/index.html` on GitHub Pages, but
built from an ESM source tree with esbuild (`npm run build`). Read README.md for the layout.

**Non-negotiables.** `template/index.html` holds the real Supabase keys in `POOL_CONFIG`; keep
them external and verbatim. Data model (measurements with `.ts`/legacy `.date`, doses with
`chem`/`oz`), localStorage key `pool_chem_webapp_v1`, and the Supabase single-row blob are
unchanged from v1 so existing data loads. Vendored React/Recharts are not edited.

**Model.** Sun-window FC decay with a learned fraction; carbonate-system pH (alkalinity + DIC,
Plummer & Busenberg constants, Davies corrections, TFP cyanurate term) for acid, bicarb,
trichlor and CO₂ outgassing with a learned rate; TFP CSI. Tests in `tests/` pin hand-checked
numbers against the owner's spreadsheet. The owner wants honest modeling, real citations and
explicit callouts of limitations; prefer calibrating to his readings over guessing.

**Dosing rules (owner's).** Chlorine: fewest 64 fl oz pours reaching the top of the FC range,
suggested when FC is below range or the forecast crosses the low bound in the chart window;
overshoot accepted. Acid (31 % muriatic): only while pH > range high, default 43 fl oz (typed in
Settings), steps 32 · 43 · 64, cap 64. Tap-to-log writes doses to the second with an undo.
The planner (engine/planner.js) simulates container-sized plans and may prefer another acid step
with a stated reason. No rain/dilution modeling by request.

**UI.** Five tabs: Home (FC → pH → CSI → long-term), Trends, Log, Advisor, Settings. Colors are
CSS variables in the "Aqua pop" palette (cyan #06b6d4 accent, navy #1e3a8a primary); icon is the
ripple drop. Avoid Crystaphase brand colors here; this is a personal app.

**Workflow.** `npm run check` locally if Node is available; otherwise commit source and let
`.github/workflows/pages.yml` lint, test, build and deploy to Pages.
