# 🔎 Trend Detective

**NASA Space Apps Challenge 2026 · Earth System Trend Detective**

Click anywhere on Earth, pick something you're curious about, and Trend Detective interrogates 45 years of NASA data (MERRA-2 reanalysis + CERES radiation, via NASA POWER) to answer: *is it really changing, or just wiggling?* And if it isn't clear yet, it tells you **how many more years of data you'd need**.

## What's inside

```
trend-detective/
├── frontend/            React 19 + TypeScript + Vite, Leaflet (NASA GIBS basemaps), Recharts
│   └── src/lib/stats.ts     browser stats engine (OLS+AR1, Mann-Kendall+Sen, Pettitt, Weatherhead)
├── backend/             Python 3.13 + FastAPI + NumPy/SciPy reference engine
│   ├── app/engine.py        same algorithms, used to independently verify the browser
│   └── tests/               pytest (incl. agreement with scipy.linregress / theilslopes) + parity fixture
├── netlify.toml         one-click Netlify deploy, proxies NASA POWER (no CORS issues)
└── render.yaml          optional one-click Render deploy for the FastAPI backend
```

**Design choice:** the app does all the maths in the browser, so the live demo works with **no backend at all**. The FastAPI service is an independent second opinion: the **🐍 Verify with Python** button sends the exact series to SciPy and shows both sets of results side by side.

## Run locally (Windows / Mac / Linux)

```bash
# 1) Frontend
cd frontend
npm install
npm run dev            # http://localhost:5173   (Vite proxies /power → NASA POWER)

# 2) Optional backend (new terminal)
cd backend
python -m venv .venv && .venv\Scripts\activate     # Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000          # docs at http://localhost:8000/docs
# then restart the frontend with:  set VITE_API_URL=http://localhost:8000   (PowerShell: $env:VITE_API_URL="http://localhost:8000")
```

Tests: `cd frontend && npm test` (browser engine vs. Python fixture) · `cd backend && pytest`

## Deploy

**Netlify (frontend):** push this folder to GitHub → Netlify → *Add new site → Import from Git* → pick the repo. `netlify.toml` sets everything (base `frontend`, build `npm run build`, publish `dist`, and the `/power/*` proxy to NASA).
No Git? Run `cd frontend && npm run build`, then drag `frontend/dist` onto https://app.netlify.com/drop. ⚠ With drag-and-drop the `netlify.toml` proxy isn't applied; the app automatically falls back to calling NASA POWER directly.

**Backend (optional):** Render → *New → Blueprint* → pick the repo (uses `render.yaml`). Then set `VITE_API_URL` to the Render URL in Netlify's environment variables and redeploy. (Netlify Functions don't run Python, which is why the backend goes on Render; any Docker host works with `backend/Dockerfile`.)

## Methods

| What | How | Reference |
|---|---|---|
| Linear trend | OLS slope, t-test, 95% CI | — |
| Autocorrelation | Effective sample size n_eff = n(1−r₁)/(1+r₁) on residuals | Santer et al. 2000, *JGR* |
| Robust trend | Mann-Kendall (ties-corrected), Sen's slope + Gilbert CI | Mann 1945; Kendall 1975; Sen 1968 |
| MK autocorrelation | Variance inflation from lag-1 of Sen-detrended series | Yue & Wang 2004 |
| Change point | Pettitt test | Pettitt 1979 |
| Years until significant | n* = [3.3 σ√(12/m) / \|ω\| · √((1+φ)/(1−φ))]^(2/3) | Weatherhead et al. 1998, *JGR* (generalised to m samples/yr) |
| Seasonality | Monthly climatology removed (anomaly mode), or analyse a season or month on its own | — |

## Data

NASA POWER monthly point API (`/api/temporal/monthly/point`, community AG), 1981 to the latest complete year. Meteorology comes from **GMAO MERRA-2**; solar and cloud variables come from **CERES** (from 1984). The app offers 20 variables in 6 groups. Basemaps: NASA GIBS Blue Marble and Black Marble.

## 🗂 My cases (personal casebook + sync)

- **📌 Open a case file** saves the current investigation: place, variable, season, AR(1) setting, chart view and regional grid, plus your notes and the verdict stamp.
- **● unsaved changes → return to saved checkpoint** and **💾 Save progress** keep an open case safe while you explore.
- **👣 Investigation trail** and the **↶ Back / ↷ Forward** buttons checkpoint every step automatically.
- **Sync across devices:** each browser gets a casebook code (e.g. `ABCD-EFGH`). Enter that code on another device to load the same cases. There's no login, so anyone with the code can see and edit those cases.

Storage, with no paid database:

| Where | Store |
|---|---|
| Every browser | `localStorage`, so it works offline and saves instantly |
| `npm run dev` | JSON files in `frontend/.data/casebooks/` (git-ignored), via a small Vite middleware |
| Netlify | Netlify Blobs, via `frontend/netlify/functions/cases.mts`. It's free and needs no setup |

All three use the same endpoint, `/.netlify/functions/cases?book=CODE`, and merge each case by its last update.
"# trend-detective" 
