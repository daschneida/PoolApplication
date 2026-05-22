# Pool Chemistry Manager — Web App

A self-contained web app that tracks and predicts your pool's free chlorine, pH,
cyanuric acid, alkalinity, calcium hardness, and Calcium Saturation Index (CSI).
Built on your own spreadsheet's additive coefficients, CSI equation, and the
calibrated chlorine-decay model.

It comes **preloaded with your 2025 spreadsheet log** (26 measurements + 16 additives).

---

## What it does

- **Plots a point every day** from your first measurement through a 7-day forecast.
  Solid dots = real measurements you entered; hollow dots = modeled by the decay
  algorithm.
- **Chlorine type matters.** When you log an additive, the app applies your
  spreadsheet's coefficients and ripples the effect through *every* parameter
  (e.g. cal-hypo raises calcium, trichlor raises CYA and lowers pH).
- **Learns your pool.** Whenever two real chlorine readings bracket known doses,
  it back-calculates your actual demand rate and overrides the model default —
  exactly like your spreadsheet's "Cl gain per day" column.
- **Tells you each day:** how much to add, when FC will hit zero, and whether
  the water is balanced (CSI).
- **Export CSV** button backs up everything (raw log + the full daily series).
- **Saves automatically** in your browser (localStorage). Optional one-time setup
  adds free cross-device cloud sync via Supabase — see "Cross-device sync setup".

---

## How to put it online (pick ONE — all free)

The whole app is a single self-contained `index.html` file (libraries embedded,
no external dependencies). You do not need Node or a build step.

### Option A — Netlify Drop (easiest, ~60 seconds, no account needed to try)
1. Go to **https://app.netlify.com/drop**
2. Drag the **entire `poolapp` folder** onto the page.
3. Netlify gives you a live URL like `https://random-name-123.netlify.app`.
4. (Optional) Make a free account to keep the site permanently and rename it.

### Option B — Vercel
1. Make a free account at **https://vercel.com**.
2. Click **Add New → Project → drag the folder**, or use the Vercel CLI:
   `npm i -g vercel` then run `vercel` inside the `poolapp` folder.
3. You get a live URL.

### Option C — GitHub Pages (best if you want a permanent, free, versioned home)
1. Create a free GitHub account and a new repository (e.g. `pool-chemistry`).
2. Upload `index.html` (and this README) to the repo.
3. Repo **Settings → Pages → Source: "Deploy from a branch" → main / root → Save**.
4. After ~1 minute it's live at
   `https://YOUR-USERNAME.github.io/pool-chemistry/`

### Using it on your phone
Once it's live at a URL, open that URL in your phone's browser and choose
**"Add to Home Screen."** It then behaves like an app icon. (Data is stored
per-browser, so your phone and laptop keep separate logs — use Export CSV to
move data between them.)

---

## Run it locally first (optional)
Just **double-click `index.html`** — it opens in your browser and works fully
offline. All libraries are embedded in the file itself, so it needs no internet
connection and no CDN at any point.

---

## Cross-device sync setup (Supabase) — optional, ~5 minutes

By default the app stores data in each browser separately. To sync across all
your devices (phone, laptop, tablet), connect a free Supabase database. Your
`index.html` stays exactly where it is on GitHub Pages; it just talks to the
database in the cloud.

### Step 1 — Create the database
1. Go to **https://supabase.com** and sign up (free).
2. Click **New project**. Give it any name, pick a region near you, set a database
   password (you won't need it for the app), and wait ~2 minutes for it to spin up.

### Step 2 — Create the table
1. In your project, open **SQL Editor** (left sidebar) and click **New query**.
2. Paste this and click **Run**:

```sql
create table pool_state (
  pool_id text primary key,
  data jsonb,
  updated_at timestamptz default now()
);

alter table pool_state enable row level security;

-- Access is gated by knowing a valid pool_id (your secret access key).
-- Anyone with the secret string can read/write only their own row.
create policy "access by pool id" on pool_state
  for all
  using (true)
  with check (true);
```

   (The policy allows access through the public anon key, and your secret
   `POOL_ID` is what actually partitions and protects your data — the
   "hard-to-guess key" model. See the security note below.)

### Step 3 — Get your two connection values
1. Open **Project Settings → API** (gear icon).
2. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
3. Copy the **anon public** key (a long string under "Project API keys"). This key
   is *designed* to be public and live in your page — that's normal and safe.

### Step 4 — Invent your secret Pool ID
Make up a long, random, hard-to-guess string — this is your private access key.
Treat it like a password. For example: `pool_7Kq2mNp9xR4wL8vT3bY6cZ1aH5sD0fG`.
Mash 30+ random letters and numbers; don't use your name or anything guessable.

### Step 5 — Paste all three into index.html
Open `index.html` in a text editor. Near the very top, right after
`<div id="root"></div>`, you'll find:

```js
window.POOL_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  POOL_ID: ""
};
```

Fill in all three (keep the quotes):

```js
window.POOL_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "your-long-anon-key-here",
  POOL_ID: "pool_7Kq2mNp9xR4wL8vT3bY6cZ1aH5sD0fG"
};
```

Commit/upload the edited `index.html` to GitHub as usual. Done — open it on any
device and the badge in the top-right will read **"cloud synced."** Put the same
`POOL_ID` in the file on every device (they all load the same GitHub file, so it's
automatic) and they'll share one log.

### How it behaves
- The badge shows **cloud synced** (saved to the database), **offline (cached)**
  (no internet — still works, will sync when back online), or **local only**
  (sync not configured).
- Data is cached locally too, so the app opens instantly and works offline; it
  pushes to the cloud about a second after each change.
- Export CSV still works as an extra backup.

### Security note — what "hard-to-guess key" means
This is the same protection model as an unlisted share link: anyone who has your
`POOL_ID` can read and write your pool data, and the database is otherwise not
publicly browsable. It's appropriate for pool-chemistry data (not sensitive) and
needs no login. It is **not** account-level security: don't reuse a `POOL_ID` you
use as a password elsewhere, and don't post it publicly. If you ever want true
per-user login (email + password) so only *you* can access it, that's a further
step we can add.

---



- **Calcium, CYA, and alkalinity stay flat between doses** because they don't
  decay on their own — they only change when you add something or dilute. This is
  intentional and chemically honest.
- **Forecast days are estimates.** Real bather load, debris, rain, and temperature
  shift the curve. The more you log, the better the demand calibration.
- A **Dichlor** entry was added (not in your original sheet) using standard
  coefficients (Cl 5159, CYA 4753, pH −90). Adjust in the `ADDITIVES` block near
  the top of the `<script type="text/babel">` section if you have better numbers.
- Cross-device sync is **not** included — that would need a database/login. CSV
  export is the bridge between devices for now.

---

## Where to change things
Open `index.html` in any text editor. Near the top of the big
`<script type="text/babel">` block you'll find:
- `ADDITIVES` — your chemical coefficients
- `PARAMS` — the target ranges (lo/hi) for each parameter
- the default `config` (pool volume 19,000 gal, temp, decay rates)
