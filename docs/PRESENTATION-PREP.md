# Trend Detective: presentation prep pack

Read in this order:
1. **Part A, Architecture deep-dive:** what each piece does and why it's there.
2. **Part B, Use cases:** who it's for and what they do with it.
3. **Part C, Presentation notes:** a script for each of the 7 slides, plus the live demo.
4. **Part D, 30 mock judge questions:** medium and hard, with detailed answers.
5. **Part E, Numbers and formulas to memorise.**

> Everything here comes from the actual code (`frontend/src/lib/stats.ts`, `power.ts`, `caseMerge.ts`, `backend/app/engine.py`, `main.py`, `netlify.toml`). Where a point depends on NASA's own documentation rather than our code, it's marked **(check POWER docs)**. Read that page once before the presentation so you can say it confidently.

---

# PART A: Architecture deep-dive

## A1. The one-sentence architecture

> A **static React app** that does **all the statistics in the user's browser**, pulls data **live from NASA POWER** through a **Netlify proxy**, keeps a **personal casebook** in `localStorage` that syncs through a **Netlify Function + Netlify Blobs**, and has an **optional Python/SciPy backend** whose only job is to independently check the browser's maths.

The hackathon build costs **$0 to run**, needs **no login**, and **keeps working if the backend is asleep**.

## A2. The layers

```
┌──────────────────────────── USER'S BROWSER ─────────────────────────────┐
│  React 19 + TypeScript SPA (Vite build)                                  │
│   ├─ UI: wizard · case files · map · 3 views (chart/stripes/heatmap)     │
│   ├─ power.ts   → fetches + caches + parses NASA POWER, builds series    │
│   ├─ stats.ts   → OLS+AR(1), Mann-Kendall+Sen, Pettitt, Weatherhead      │
│   ├─ story.ts   → plain-language verdicts, wizard suggestions, cases     │
│   ├─ casebook.ts→ saved cases, sync, undo/redo trail                     │
│   └─ localStorage: NASA response cache · casebook copy · trail           │
└───────────────┬──────────────────────┬──────────────────────┬────────────┘
                │ /power/*             │ /.netlify/functions/ │ (optional)
                ▼                      ▼ cases?book=CODE      ▼ POST /api/analyze
┌──────── NETLIFY (free) ───────┐ ┌──────────────────────┐ ┌──────────────────────┐
│ CDN serves the static app     │ │ cases.mts function    │ │ FastAPI + NumPy/SciPy│
│ /power/* → 200 rewrite proxy  │ │ → Netlify Blobs store │ │ on Render (Docker)   │
└───────────────┬───────────────┘ └──────────────────────┘ └──────────────────────┘
                ▼
     NASA POWER monthly point API (MERRA-2 + CERES)      NASA GIBS map tiles
```

### Layer 1: frontend (React 19 + TypeScript + Vite)
- **Single-page app.** Vite compiles it to static HTML/JS/CSS in `frontend/dist`, which Netlify serves from its CDN.
- **Map:** Leaflet via `react-leaflet`. Basemaps are **NASA GIBS WMTS tiles**: Blue Marble shaded relief, plus VIIRS Black Marble (the night lights layer, dated 2016-01-01). Esri supplies a dark base layer and a labels overlay. None of them need an API key.
- **Charts:** Recharts draws the trend chart. The climate stripes and the month × year heat-map are custom components.
- **State in the URL hash:** lat, lon, variable, mode and so on are written to `location.hash`, so **🔗 Copy share link** reproduces exactly the same investigation on any device.

### Layer 2: data access (`power.ts`)
This is what happens when you click a point:
1. **Rounding:** lat and lon are rounded to 2 decimals. That gives a consistent cache key, and NASA's grid is much coarser than 0.01° anyway.
2. **In-memory dedupe (`memo` map):** if three components ask for the same series at once, only **one** network request is sent. Each caller can still cancel its own wait with an `AbortSignal`, but the shared request is never aborted.
3. **`localStorage` cache** (key `td1:PARAM:lat:lon`): a repeat visit uses **no network**. It also takes load off NASA's public service.
4. **Two-base fallback:** the app tries `/power/...` (the Netlify or Vite proxy) first, then `https://power.larc.nasa.gov` directly. Validation errors (HTTP 400/422) are **not** retried, because they are real errors and not network problems.
5. **End-year fallback:** the app asks for 1981 to 2025. If NASA rejects that (the year isn't complete yet), it asks for 1981 to 2024.
6. **Parsing:** `-999` (NASA's fill value) becomes `null`. Key `YYYY13` is NASA's annual value, and the code keeps it separate from the 12 monthly values.
7. **`buildSeries(mode)`** turns the raw data into the series to analyse:
   - `annual`: one value per **complete** year (NASA's annual value, or the mean of the 12 months if that's missing).
   - `anomaly`: every month minus that month's **climatology** (mean over complete years). This removes the seasonal cycle and gives about 12× more points (`ppy = 12`).
   - `DJF/MAM/JJA/SON`: the season mean. **DJF uses December of the previous year** and is labelled with the January year.
   - `m1…m12`: a single calendar month.
   - It also returns the anomaly grid that the heat-map uses.
8. **`pool(items, 4, fn)`:** a concurrency limiter. The regional grid sends **at most 4 requests at a time**, to be polite to NASA's shared service. One failed cell doesn't break the grid.

### Layer 3: statistics engine (`stats.ts`, mirrored in `engine.py`)
It's pure TypeScript with **no maths library**. We wrote the special functions ourselves: log-gamma (Lanczos), the incomplete beta (continued fraction) for Student-t p-values, and erf for the normal CDF. Quantiles are found by bisection.

`analyze(t, y, pointsPerYear)` runs **four** things:

| # | Test | What it answers | Key detail |
|---|---|---|---|
| 1 | **OLS + AR(1)** ("detective 1") | Is there a straight-line trend? | Slope, SE, t, p, 95% CI. Lag-1 autocorrelation r₁ of the residuals → **n_eff = n(1−r₁)/(1+r₁)** (Santer 2000), floored at 3.01. SE and degrees of freedom (n_eff−2) use n_eff. The correction applies only when r₁ > 0. |
| 2 | **Mann-Kendall + Sen** ("detective 2") | Is there a *monotonic* trend, ignoring outliers? | S = Σ sign(yⱼ−yᵢ), ties-corrected variance, continuity-corrected z. **Sen slope** = median of all pairwise slopes. **Gilbert CI** from ranks. **Yue & Wang (2004)** inflates Var(S) by 1+2Σ(1−k/n)r₁ᵏ, using r₁ of the *Sen-detrended* series. |
| 3 | **Pettitt** | Was it a steady ramp or a sudden jump? | Finds the index k where |U_k| is largest; p ≈ 2·exp(−6K²/(n³+n²)). Also returns the mean before and after. |
| 4 | **Weatherhead 1998** | If the trend isn't significant yet, how many years until it would be? | n* = [3.3·σ·√(12/m)/|ω| · √((1+φ)/(1−φ))]^(2/3), with an uncertainty band n*·e^(±B), B = 4/(3√n*)·√((1+φ)/(1−φ)). φ is clamped to [0, 0.95]. |

**Verdict logic** (`analyze` and `story.ts::verdict`):
- `significant` = OLS p < 0.05 **AND** MK p < 0.05 → **"Case closed"**. The strength word comes from the larger of the two p-values: <0.001 "overwhelming", <0.01 "strong", otherwise "solid".
- `agree = false` (one test is significant, the other isn't) → **"Suspicious, but the detectives disagree"** (the mixed tone). It points the user to the change-point clue.
- Neither is significant → **"Not enough evidence… yet"**, plus the Weatherhead estimate: "in roughly N more years, around YEAR", or "essentially no drift" if N is infinite or more than 300.
- The direction comes from the **sign of the Sen slope**. The headline change ("risen by about X") is Sen slope × years.

### Layer 4: regional grid (in `App.tsx`)
- An n×n grid (3 to 7) over a span of 4° to 32°, centred on the selected point.
- **Longitude spacing is stretched by 1/cos(lat)** (clamped at 0.35) so the cells stay roughly square on the ground. Longitude wraps around ±180 and latitude is clamped to ±89.
- Each cell runs the **full test** in the browser. The cell is drawn solid if it's significant and faded if not, using a **diverging palette chosen per variable** (brown↔teal for water, blue↔red for heat).
- A counter shows ▲ up, ▼ down and "not sig." totals.

### Layer 5: casebook and sync (`casebook.ts`, `caseMerge.ts`, `cases.mts`)
- A **snapshot** captures the whole investigation: lat, lon, place, variable, mode, AR(1) setting, view, region, grid size and span. A case = snapshot + name + notes + verdict tone and headline + timestamps.
- **Offline-first:** every change goes to `localStorage` immediately. A sync is scheduled **700 ms later** (debounced).
- **Sync:** `PUT /.netlify/functions/cases?book=ABCD-EFGH` with all cases. The server merges them with what it has stored and returns the merged list, which the client merges again. The app also syncs **on window focus**, which picks up changes made on other devices.
- **Merge rule:** **per-case last-write-wins** on `updatedAt`. **Deletes are tombstones** (`deleted: true`), so a delete also syncs and isn't brought back by an old device.
- **Casebook code:** 8 characters from a 32-symbol alphabet with no look-alike characters (no I, O, 0 or 1), generated with `crypto.getRandomValues`. 32⁸ ≈ **1.1 × 10¹²** possible codes.
- **Defensive server:** the payload is limited to 400 KB, a casebook keeps at most 300 cases, and `sanitizeCases` caps every string length and checks every field type. The **same merge code** runs in the browser, in the Netlify Function and in the Vite dev middleware, which writes to `frontend/.data/casebooks/*.json` during local development.
- **Investigation trail:** automatic undo/redo checkpoints (↶ ↷), stored per device.

### Layer 6: Python verification backend (FastAPI)
- `POST /api/analyze` runs the same tests on whatever series it is sent. That's what **🐍 Verify with Python** calls.
- `GET /api/trend` fetches NASA POWER and analyses it entirely on the server.
- `GET /api/region` builds a server-side grid, limited to 4 concurrent requests with an `asyncio.Semaphore`.
- `GET /api/health` is a liveness check.
- Pydantic validates the input: at least 8 points, 0 < α < 0.5, 1 ≤ points per year ≤ 366.
- **Why it exists:** it's an independent second implementation built on NumPy/SciPy. If the browser maths were wrong, the two would disagree.

### Layer 7: testing and "can't drift" guarantee
- `backend/tests/make_fixture.py` generates synthetic series and the Python engine's expected results, stored in `fixture.json`.
- **Python tests (pytest):** OLS without AR(1) matches `scipy.stats.linregress` (slope within 1e-10, p within 1e-8). Sen slope matches `scipy.stats.theilslopes` (within 1e-10). Pettitt finds a planted step change at 1993 to 1995. The series builder is checked for anomaly length, the DJF year and per-month values.
- **TypeScript tests (vitest):** t-quantiles match printed tables (t₀.₉₇₅,₁₀ = 2.228), and the **parity test** runs the browser engine on the *same fixture* and asserts agreement with Python to 6 to 8 decimal places.
- So both engines are pinned to the same answers. If either one changes, a test fails.

### Layer 8: deployment
- `netlify.toml`: base `frontend`, build `npm ci && npm run build`, publish `dist`, Node 22, functions in `netlify/functions`. Two redirects: **`/power/*` → `https://power.larc.nasa.gov/:splat` (status 200 = proxy, not redirect)** and an SPA fallback `/* → /index.html`.
- `render.yaml` and `Dockerfile` deploy the Python backend to Render. The frontend learns its URL from the build-time `VITE_API_URL`.
- The Python backend is on Render because **Netlify Functions don't run Python**.

## A3. End-to-end: what happens in one click (say this fluently)
1. The user clicks Svalbard. The map reports (78.22, 15.65).
2. `fetchPoint('T2M', 78.22, 15.65)` checks the in-memory memo, then `localStorage`. On a miss it calls `/power/api/temporal/monthly/point?parameters=T2M&community=AG&…&start=1981&end=2025`.
3. Netlify's edge proxies that to NASA, so the browser sees a same-origin response and there's no CORS problem.
4. The JSON is parsed into a year → 12-month map plus annual values, and cached.
5. `buildSeries('annual')` gives about 44 to 45 complete-year values.
6. `analyze()` runs OLS+AR(1), MK+Sen, Pettitt and Weatherhead in a few milliseconds.
7. `verdict()` writes the plain-language result. The chart, stripes and heat-map render from the same series.
8. The URL hash updates, so the investigation can be shared. The trail gets a checkpoint.
9. *(Optional)* **Verify with Python** POSTs the exact `t`, `y` and points-per-year to FastAPI. The UI shows both results side by side.

## A4. Why these architecture choices (the "why" judges care about)
| Decision | Reason | Trade-off we accept |
|---|---|---|
| Maths in the browser | Zero server cost, scales with the number of users, works if the backend sleeps, privacy (nothing about the user is stored) | We had to write our own special functions, so we verify them against SciPy |
| Proxy NASA through Netlify | Avoids CORS, one origin, can be swapped for a cache later | Depends on Netlify, so there's a direct fallback |
| `localStorage` cache | Fast repeat visits, fewer calls to NASA | A browser quota of about 5 MB. We catch quota errors silently |
| Casebook code instead of login | No personal data, no passwords, child-safe for classrooms | Anyone with the code can see and edit those cases |
| Last-write-wins per case | Simple, predictable, no conflict UI needed | Two people editing the same case at once: the latest save wins |
| Second engine in Python | Independent verification builds trust | Two code bases to maintain, so the parity fixture is there to catch drift |

## A5. Future Azure architecture (slide 6)
The future version maps each current piece to an Azure service, so there's **no rewrite**:
- Netlify CDN → **Static Web Apps + Front Door/WAF**
- Netlify Function → **Azure Functions** (same `cases` endpoint and JSON)
- Netlify Blobs → **Cosmos DB** (partitioned by user)
- Render → **Container Apps** (same FastAPI Docker image, scales to zero)

New pieces:
- **Redis** cache of NASA responses
- **Entra External ID** for classrooms
- **API Management** for a public trend API
- **Data Factory → Data Lake (Zarr/Parquet)** to ingest IMERG, MODIS and GRACE
- **Batch/ML** for a nightly *global trend atlas*
- **Azure OpenAI** for "Ask the detective"
- **Monitor/App Insights/Key Vault** for operations
- **GitHub Actions** to run both test suites before every deploy

---

# PART B: Use cases

| Who | Their question | What they do in the app | What they get |
|---|---|---|---|
| **School student (12 to 16)** | "Is my city getting hotter?" | Start here → Big city → Is it getting hotter? → pick Night-time low | A verdict in plain words, a definition of the variable written for kids, climate stripes they can screenshot for a project |
| **Teacher** | "How do I teach that 'not significant' ≠ 'no change'?" | Case file **The Patient Detective** (noisy wind at Chennai) | The years-until-significant meter turns "inconclusive" into "we'd know by about 20XX" |
| **Geography class** | "Why don't all places change the same way?" | Case file **Rising Here, Falling There** (summer soil moisture, Spain → Scandinavia) | A regional grid showing drying in one area and wetting in another |
| **Farmer / agri-extension worker** | "Is the monsoon season drier now?" | Click the farm, choose Root-zone soil wetness or Rainfall, mode JJA | A season-specific trend, a CSV download for their own analysis |
| **Journalist** | "Is the claim 'the rains have returned to the Sahel' true?" | Case file **Sahel: Return of the Rains?** | Both tests plus a Pettitt change-point year, a share link to cite |
| **Solar planner** | "Is sunshine here changing?" | Sunlight reaching the ground vs clear-sky sunlight | Separates the effect of clouds from haze or pollution |
| **Researcher / student analyst** | "Can I trust these numbers?" | Verify with Python, Download CSV | Agreement with SciPy, raw data to re-analyse |
| **Anyone, over time** | "I want to come back to this" | Open a case file, add notes, sync with the casebook code on a phone | A persistent investigation with no account |

**The core idea in one line:** *the global average doesn't help people decide locally. Trend Detective answers the local question honestly, including "we can't tell yet, and here's how long it will take."*

---

# PART C: Presentation notes (7 slides + live demo)

**Suggested timing for a 5-minute slot:** slides 1 to 3 in 1:30, live demo for 2:00, slides 4 to 7 in 1:30. With 3 minutes, show slide 1, then the demo, then slide 5 and slide 7.

### Slide 1: Title: "Trend Detective"
> "Hi, we're Trend Detective. Climate headlines give you global averages, but nobody lives in the global average. We let anyone click **any point on Earth**, pick something they care about, and put that place **on trial** with **45 years of NASA data**: MERRA-2 reanalysis and CERES radiation, through NASA POWER. 20 variables, any season or month, one click."

*Tip:* point at the "CASE CLOSED" stamp. It sets up the detective theme.

### Slide 2: The problem
> "There are three problems. One: people care about their own place, not the global mean. Two: trend statistics are easy to get wrong. Climate data has **memory**, so this year resembles last year, and if you ignore that you get false alarms. Three: '**not significant**' gets misread as 'nothing is happening', when it usually means '**not detectable yet**'. Our answer covers all three: click anywhere, two independent tests, and when the answer is 'not yet', we tell you **how many years until it would be**."

### Slide 3: How it works (5 steps)
> "Pick a place on the map or use the two-question wizard. Ask a question: heat, rain, snow, sun, wind. We fetch NASA POWER live. **Two detectives** test it: a straight-line test corrected for autocorrelation, and the Mann-Kendall rank test with Sen's slope, which isn't fooled by outliers. Then a plain-language verdict. On top of that there's a **regional trend map**, up to 7 by 7 points, and **five guided case files** that teach the ideas on their own."

### LIVE DEMO (about 2 minutes). Follow this exact path
1. **Landing page (Svalbard):** "Svalbard, air temperature, yearly. Both detectives agree: **case closed**." Read the °C per decade figure from the screen. *Don't memorise a number; read the live one.*
2. **Tap a detective card:** "Here's the OLS slope with its 95% interval, and here's the **effective sample size**. Autocorrelation shrinks 45 years down to fewer independent years."
3. **Switch to Stripes, then the heat-map:** "Every year as a stripe. The heat-map shows which **months** changed most."
4. **Case file → The Patient Detective** (Chennai wind): "Noisy variable, so the verdict is '**not enough evidence yet**'. But look: the meter says roughly **N more years**. That's honest uncertainty, not a 'no'."
5. **Case file → Rising Here, Falling There → Next clue:** the grid loads. "Same variable, same season: **brown is drying, teal is wetting**, a few hundred kilometres apart. Faded cells aren't significant. That's why one global number never tells the whole story."
6. **🐍 Verify with Python:** "Every number, recomputed independently in SciPy. They match."
7. *(If time)* **📌 Open a case file** → "Saved, and synced to my phone with this code."

**Backup plan if the Wi-Fi or NASA fails:** open the cases you prepared earlier. The NASA responses are **cached in `localStorage`**, so pre-load every demo case on the presentation laptop the night before, in the same browser. Also have `docs/demo/Trend-Detective-Demo-30s.mp4` and the screenshots in `docs/demo/screens/` ready to show.

### Slide 4: Architecture
> "It's serverless and **free to run**. All the statistics run **in the browser** in TypeScript, so there's no server cost, it scales with users, and nothing personal is stored. NASA requests go through a **Netlify proxy**, so there are no CORS problems, and they're cached locally to be kind to NASA's servers. The regional grid uses a **pool of four** parallel requests. Saved cases live in localStorage and sync through a Netlify Function into **Netlify Blobs**, with no database to manage. And there's an **independent FastAPI and SciPy backend**, used only to verify."

### Slide 5: Statistically honest, independently verified
> "Four methods, all cited. OLS with **Santer 2000** effective sample size. Mann-Kendall and Sen with the **Yue and Wang 2004** variance correction. **Pettitt** change-point, to tell a ramp from a jump. **Weatherhead 1998** for years-until-detectable. A case closes **only when both detectives agree**. And it's tested: our Python engine matches `scipy.stats.linregress` and `theilslopes`, and a shared fixture pins the browser and Python engines together so they can't drift apart."

### Slide 6: Future on Azure
> "It scales without a rewrite. Each piece maps one to one: Static Web Apps behind Front Door, Functions with the same endpoint, Cosmos DB in place of Blobs, Container Apps running the same FastAPI image. Then we add what a hackathon can't: Redis caching, classroom sign-in with Entra, more NASA datasets through Data Factory (IMERG rainfall, MODIS vegetation, GRACE groundwater), and a nightly **global trend atlas**."

### Slide 7: What's next
> "**Now:** live on Netlify, 20 NASA variables, casebook sync, Python verification. **In 3 months:** compare two places, more NASA datasets, teacher mode with worksheets. **6 to 12 months:** Azure, classrooms, the global atlas, AI explanations, offline mode. Try it at this URL. Thank you, we'd love your questions."

**Delivery tips**
- Say "**detect**, not attribute" whenever someone says "proves climate change".
- If you don't know an answer, say: "Good question. Our current build does X; the honest limitation is Y; the fix we'd make is Z." Judges reward honesty far more than bluffing.
- Before slide 1, replace `[paste Netlify URL]` and `[paste GitHub URL]` on slides 1 and 7.

---

# PART D: 30 mock judge questions (medium to hard)

Each answer follows the pattern **direct answer → reasoning → limitation or next step**. Don't read them out word for word; learn the structure.

## Section 1: Data and science

### Q1. MERRA-2 is a reanalysis, not observations. Why should anyone trust a trend computed from a model?
**Answer:** A reanalysis takes millions of real observations (satellites, radiosondes, surface stations, aircraft) and blends them into a physically consistent model. The result is a **complete, gap-free gridded record** for every point on Earth, which raw station data can't give you in most of Africa, the oceans or the poles. That coverage is exactly why we chose it: "click anywhere" only works with gridded data.

**The honest limitation:** reanalyses can produce **spurious trends when the observing system changes**, for example when new satellites are added. Some variables are known to be less reliable than others. Temperature is generally robust; precipitation and wind trends from reanalyses are less so.

**How we handle it:** we show the **NASA source for every variable**, the **Pettitt test** can flag a suspicious sudden jump, and we describe results as "what NASA's reanalysis shows". Next step: cross-check against observation-based products such as GPM IMERG for rain, which is already on our roadmap.

### Q2. What's the spatial resolution? If I click two points 10 km apart, do I get different answers?
**Answer:** Usually **no**. NASA POWER serves values from the native grid: about **0.5° × 0.625°** for MERRA-2 meteorology (around 50 km) and about **1°** for the solar and cloud variables **(check POWER docs)**. Two clicks inside the same grid cell return the same series. We round coordinates to 0.01° only for caching, which doesn't change the data.

That's why the **regional grid** defaults to spans of several degrees: it samples genuinely different cells. If we were asked to improve it, we'd show the grid-cell outline on the map so users can see the footprint they're actually testing.

### Q3. Your "Hot Nights in the City" case uses Bengaluru. Can a 50 km reanalysis cell even see an urban heat island?
**Answer:** This is a sharp question, and the honest answer is **not directly**. MERRA-2 doesn't resolve the urban canopy, so what we show is **regional** night-time warming around Bengaluru, not the city-versus-countryside difference.

The case is still valid for its teaching goal: comparing how fast nights warm against days (the shrinking day-night gap) is a known large-scale signal. But we should word it carefully, and we will.

**Next step:** add **MODIS or Landsat land-surface temperature** (about 1 km), which can actually show urban heat islands. It fits our Data Factory → Data Lake roadmap.

### Q4. You label solar variables "CERES from 1984", but CERES launched around 2000. Explain.
**Answer:** Correct. NASA POWER's solar record before CERES comes from the **GEWEX Surface Radiation Budget** product, and from about **2001** it uses **CERES-based** products **(check POWER docs for the exact split)**. We label the variables by POWER's current source, and the series begins in 1984.

**Why it matters for trends:** joining two products can introduce a **step change** that looks like a trend. That's exactly what our **Pettitt test** helps catch. If a solar series shows a change point around 2000 to 2001, that's a warning sign, not necessarily a real climate signal. A good improvement is an automatic warning when the change-point year coincides with a known product transition.

### Q5. How do you handle missing data, incomplete years and NASA's fill values?
**Answer:**
1. NASA's **-999** fill values become `null` when we parse the data.
2. In **annual** mode we use **only complete years** (all 12 months present), so a half-finished final year can't bias the last point.
3. The **monthly climatology** used for anomalies is computed from complete years only.
4. In **season** mode a year is included only if **all three months** exist, and DJF borrows **December from the previous year**.
5. We request data up to 2025 and fall back to 2024 if NASA rejects that year.
6. **Anomaly** mode keeps every available month, including a partial final year, because each month is compared with its own climatology.

### Q6. Why remove the seasonal cycle in "anomaly" mode? What goes wrong if you don't?
**Answer:** Monthly temperature has a huge annual cycle, maybe 20 °C between summer and winter, which swamps a trend of 0.3 °C per decade. Regressing raw monthly values would give a mostly meaningless slope, with residuals that are enormous and strongly periodic.

Subtracting each calendar month's long-term mean (the **climatology**) leaves only the departures. You get **12× more data points**. But neighbouring months are correlated, so the **AR(1) correction becomes essential**. Without it, 540 monthly points would look like 540 independent pieces of evidence and give falsely tiny p-values. The "Patient Detective" case teaches exactly this.

## Section 2: Statistics (expect the hardest questions here)

### Q7. Explain autocorrelation and your correction to a non-statistician, then give the formula.
**Answer (simple):** Climate has **memory**. A warm year is often followed by another warm year. So 45 years of data contain **less independent information** than 45 coin flips. If you ignore that, you're overconfident and see trends that aren't there.

**Formula:** we compute the lag-1 autocorrelation **r₁** of the regression residuals and use the **effective sample size** n_eff = n·(1−r₁)/(1+r₁) (Santer et al. 2000). The standard error uses SSE/(n_eff−2), and the t-test uses n_eff−2 degrees of freedom. For example, r₁ = 0.3 turns 45 years into about **24 effective years**.

For Mann-Kendall we use Yue & Wang (2004), which inflates the variance of S by 1 + 2·Σ(1−k/n)·r₁ᵏ, using r₁ of the Sen-detrended series. We apply a correction only when r₁ > 0. Negative autocorrelation would *shrink* the variance, which is the anti-conservative direction, so we leave it alone.

### Q8. AR(1) is a simple model. What if the real noise has long memory, like ENSO or decadal cycles?
**Answer:** Then our correction is **too weak**, and p-values could still be somewhat optimistic. AR(1) captures only one-step memory. Processes like ENSO (2 to 7 years), the PDO or the AMO add low-frequency variability that AR(1) underestimates, especially in monthly anomaly mode.

We chose AR(1) because it's the **standard in the trend-detection literature** (Santer, Weatherhead, Yue & Wang all use it), it can be explained to students, and it's far better than no correction.

**Mitigations:** requiring **both** tests to agree adds conservatism, and the user can switch the correction off and on to see how much it matters. **Next steps:** an AR(p) or ARMA(1,1) correction, or block-bootstrap p-values, done in the Python backend first.

### Q9. Why require *both* OLS and Mann-Kendall to agree? Isn't that just ad-hoc?
**Answer:** It's a deliberate **conservative design choice**, not a formal combined test. The two tests make **different assumptions**:
- OLS assumes a linear trend and roughly normal residuals, and it's sensitive to outliers.
- Mann-Kendall is non-parametric, tests for any **monotonic** trend, and is robust to outliers and skew. That suits things like rainfall and snow depth.

When both agree, the result is robust to the main failure mode of each. When they disagree, we don't hide it: we show a separate "**Suspicious, but the detectives disagree**" verdict and point to the change-point clue. Disagreement usually means a few extreme years are driving the OLS result.

The cost is **less statistical power**. We'd rather say "not yet" than raise a false alarm, especially for students. A formal alternative is to report both p-values and use the larger one. That's effectively what we do, and it's also what decides the strength wording.

### Q10. Your regional grid runs up to 49 tests. At α = 0.05 you'd expect about 2.5 false positives even with no trend anywhere. How do you handle multiple testing?
**Answer:** Honestly, **we don't correct for it yet**. Each cell is tested on its own at 5%, so a few solid cells in a 7×7 grid could appear by chance. Neighbouring cells are also spatially correlated, so they aren't independent tests, which makes the problem more complicated.

**Mitigation today:** we show the full ▲/▼/not-significant counts, so users see the overall pattern rather than one cell. And the teaching point is about **coherent patterns** (a whole region drying), not individual cells.

**The fix:** apply the **False Discovery Rate** (Benjamini-Hochberg) across the grid. Wilks (2016) recommends this approach for "field significance" in climate maps. It's about 15 lines of code, and we'd show "significant after FDR" as a toggle. It's a good, concrete answer to give.

### Q11. Users can test 20 variables × 17 time slices × any location. Isn't that a p-hacking machine?
**Answer:** It *could* be if someone went fishing, and we take that seriously. Three things help:
1. The **wizard suggests variables from a question** ("Is it getting hotter?"), which encourages a hypothesis before the test.
2. The **case files** model good practice: one question, one test, then checks.
3. The two-test agreement plus the AR(1) correction make chance "convictions" rarer.

What we *don't* do is track how many tests a user has run. A good classroom feature would be an "**evidence log**" showing "you've tested 25 combinations, so expect about one false positive". That turns p-hacking itself into a lesson.

### Q12. Explain the "years until significant" formula. Where does the 3.3 come from, and what does the answer mean?
**Answer:** From **Weatherhead et al. (1998)**: n* = [ (3.3·σ_N / |ω|) · √((1+φ)/(1−φ)) ]^(2/3), where:
- **ω** = trend per year (our OLS slope)
- **σ_N** = noise standard deviation (of residuals, scaled by √(12/m) because the paper is written for monthly data and we generalise to m samples per year)
- **φ** = lag-1 autocorrelation, clamped to [0, 0.95]

**3.3** is roughly z₀.₉₇₅ + z₀.₉₀ = 1.96 + 1.28 ≈ 3.24. That's the margin needed to detect the trend at the **5% level with about 90% probability**.

**Interpretation:** "If the current drift is real and continues, with this much noise and memory, about n* years of data are needed to detect it." We subtract the years already in the record and give an **uncertainty band** n*·e^(±B), where B = 4/(3√n*)·√((1+φ)/(1−φ)).

The intuition: n* grows with noise and memory and shrinks with bigger trends, and the 2/3 power comes from how a slope's standard error falls as n^(-3/2).

### Q13. Isn't that circular? You plug in a slope that you just said isn't significant.
**Answer:** Yes, and that's the right criticism. The estimate is **conditional**: *if* the current best-estimate slope were the true trend, how long would detection take? If the true trend is actually zero, the "years until significant" are effectively infinite, and our estimate would mislead.

We say this in the verdict text, which reads "**If the current drift carries on**…". We show an uncertainty range, not one number. And we fall back to "essentially no drift; looks like natural variability" when n* is infinite or more than 300 years.

**Improvement:** compute n* across the **whole confidence interval of the slope**, giving something like "between 12 and 80 years, or never if the trend is zero". That's more honest than a single central value.

### Q14. What exactly does the Pettitt test tell you, and can it be fooled by a steady trend?
**Answer:** Pettitt is a rank-based test for a **single shift in the median**. It finds the time k where the statistic |U_k| peaks, and gives an approximate p ≈ 2·exp(−6K²/(n³+n²)). We also show the **mean before and after**.

**Yes, it can be fooled:** a smooth linear trend will often produce a "significant" change point somewhere near the middle, because the first half is lower than the second half. That's why we present it as a **clue**, not a verdict.

The real diagnostic is to **compare**: if the means before and after differ by about the trend times the record length, it's a ramp. If the series is flat within each segment with a jump between them, it's a shift. The Sahel case is the classic example: the 1970s and 80s drought followed by partial recovery. A future version could fit a piecewise-linear model and compare AIC against a straight line.

### Q15. Why did you write your own statistics functions instead of using a library? How do you know they're right?
**Answer:** **Why:** the browser has no SciPy. We wanted zero dependencies, a small bundle and full control, and the mathematics involved is well known. We implemented the Lanczos log-gamma, the incomplete beta function by continued fraction (for t p-values), erf (for normal p-values), and bisection for quantiles.

**How we know they're right:**
1. Unit tests against **printed tables**: t₀.₉₇₅ with 10 df = 2.228, Φ(1.96) = 0.975.
2. The **Python engine matches SciPy**: OLS without the AR(1) correction against `linregress` (slope within 1e-10, p within 1e-8), and Sen slope against `theilslopes`.
3. The **TypeScript engine matches the Python engine** on a shared fixture, to 6 to 8 decimal places in the tests. In practice the differences are around 1e-15, which is floating-point rounding, because both use IEEE-754 double precision.
4. Users can press **Verify with Python** on *their own* series at any time.

### Q16. What's the computational complexity? Is Mann-Kendall okay in the browser on monthly data?
**Answer:** Mann-Kendall and Sen's slope are **O(n²)** because they look at every pair, and Pettitt as written is also O(n²). The worst case is anomaly mode with about 540 monthly points: around **145,000 pairs**, plus sorting about 145,000 slopes for the Sen median. That's **milliseconds** in a modern JavaScript engine.

The regional grid at 7×7 is 49 such analyses, still well under a second of CPU time. The real bottleneck is **network fetches from NASA**, not maths. For daily data (n ≈ 16,000) we'd move the work to a Web Worker or the backend, and use the O(n log n) Kendall algorithm and a faster Sen slope.

### Q17. Sen's slope confidence interval: how is it computed?
**Answer:** Using the **Gilbert (1987)** rank method. Sort all N pairwise slopes. Compute C = z₁₋α/₂·√Var(S), using the **autocorrelation-inflated** variance. The lower and upper bounds are the slopes at ranks M₁ = (N−C)/2 and M₂ = (N+C)/2 + 1, clamped to the valid range.

It's distribution-free, so it doesn't assume normal residuals, and it automatically widens when autocorrelation is high.

## Section 3: Engineering and architecture

### Q18. Why put the statistics in the browser instead of a proper backend? Isn't that unusual?
**Answer:** It's deliberate, and there are four reasons:
1. **Cost:** a static site on a CDN is free at any scale. Each user's device does its own computing.
2. **Resilience:** free backends sleep (Render's free tier spins down), but our app works fully without one.
3. **Latency:** no round trip to a server for maths, so changing the mode or variable gives instant results from cached data.
4. **Privacy:** nothing about what the user explores leaves their device, except the request to NASA.

The Python backend still exists, as an **independent verifier and a future public API**. Because the algorithms are the same in both, we can move work between them, for example a server-side global atlas, without changing the results.

### Q19. What happens when NASA POWER is slow, rate-limits you, or goes down during the demo?
**Answer:** There are several layers of defence:
1. **`localStorage` cache:** anything viewed before loads without the network.
2. **In-memory dedupe:** we never send duplicate requests at the same time.
3. **A concurrency pool of 4** for the grid, to be a polite user of a shared public service.
4. **Proxy → direct fallback** if the Netlify proxy fails.
5. **End-year fallback** (2025 → 2024).
6. **Per-cell error isolation:** one failed grid cell doesn't break the map.

What we *don't* have yet is automatic retry with exponential backoff for HTTP 429 or 503 responses, which is a small addition. At scale, the Azure plan puts **Redis** in front of NASA, so popular locations hit NASA once rather than once per user. For the demo, we pre-load all demo cases.

### Q20. Why proxy NASA through Netlify? Doesn't NASA POWER allow CORS?
**Answer:** Browser cross-origin rules can block or behave inconsistently with third-party APIs, so a same-origin proxy **removes that whole category of failure**. `netlify.toml` rewrites `/power/*` to `power.larc.nasa.gov` with **status 200**, which means it's a transparent proxy, not a redirect. Vite does the same in development.

It also gives us **one place** to add caching or rate limiting later. If someone deploys by drag-and-drop, where the proxy isn't configured, the app automatically falls back to calling NASA directly.

### Q21. Your casebook has no login. Isn't that a security problem? Can someone guess my code?
**Answer:** It's a deliberate privacy-first trade-off: **no accounts, no emails, no passwords**, which is important for children in classrooms. The code is 8 random characters from a 32-symbol alphabet (generated with `crypto.getRandomValues`), so there are about **1.1 trillion** possible codes. Guessing a specific one is impractical.

**Weaknesses we acknowledge:**
1. There's **no rate limiting** on the function yet, so mass enumeration is theoretically possible.
2. **Anyone with the code can edit**: it works like a shared link.

**Server-side hardening that already exists:** a 400 KB payload limit, at most 300 cases, `sanitizeCases` caps every string and validates every type, and unknown fields are dropped. The data is low-sensitivity (map coordinates and notes).

**Next steps:** rate limiting per IP, a read-only share code separate from the edit code, and real accounts through Entra External ID for teachers.

### Q22. How does sync work, and what happens when two devices edit at the same time?
**Answer:** It's **offline-first**. Every change is written to `localStorage` immediately, and a sync is scheduled 700 ms later. The sync sends all cases to the function. The server merges them with what's stored and returns the result, and the client merges again. We also sync whenever the tab regains focus.

The merge is **per-case last-write-wins** on `updatedAt`, so editing two *different* cases on two devices never conflicts. **Deletes are tombstones**, so an old device can't bring back a deleted case. The same merge code runs on the client, the server and the dev server.

**The limitation:** if the *same* case is edited on two devices at once, the later save wins and the other edit is lost. Timestamps come from device clocks, so a badly wrong clock could win unfairly. For notes, a proper fix would be a **CRDT** (for example Yjs) or server-assigned version numbers. For a hackathon, LWW is the right simplicity trade-off.

### Q23. How do you make sure the TypeScript and Python engines don't drift apart as you change code?
**Answer:** With a **shared golden fixture**. `make_fixture.py` creates synthetic test series (a clean trend, a noisy trend with outliers, a step change) and stores the Python engine's expected outputs in `fixture.json`.
- **pytest** checks the Python engine against SciPy.
- **vitest** imports the *same* JSON and asserts that the TypeScript engine matches Python: slope, p-values, confidence intervals, S, Sen slope and bounds, Pettitt index, and n*.

If someone changes the maths on one side only, a test fails. In the Azure plan, GitHub Actions runs **both suites before every deploy**.

### Q24. How would this scale to 1 million students? What breaks first?
**Answer:** The **frontend scales for free**: it's static files on a CDN, and the maths runs on each user's device. What breaks first is **NASA POWER**: a million users each fetching 49 grid points would be irresponsible towards a shared public service.

**The fix, in order:**
1. A shared **Redis cache** in front of NASA. Classes tend to look at the same famous places, so the cache hit rate would be high.
2. A **precomputed global trend atlas**: a nightly batch job computes trends for every grid cell, for every variable and season, and stores them in Zarr or Parquet in the Data Lake. The regional map then becomes one fast tile request.
3. **Cosmos DB** for casebooks, partitioned by user, and **API Management** for rate limits.

The Azure slide is designed around exactly this bottleneck.

## Section 4: Impact, users and originality

### Q25. Tools like NASA Giovanni, Worldview, Climate Reanalyzer and the IPCC Atlas already exist. What's new here?
**Answer:** Those tools are excellent at **showing data**. Giovanni can even plot time series and area averages, but they assume you already know how to judge whether a trend is real. Our contribution is the **inference and the explanation**:
1. Every point comes with a **significance verdict corrected for autocorrelation**.
2. **Two independent tests** must agree.
3. **"Not significant yet" is quantified** as years until detection. We don't know of a consumer tool that does that.
4. **Plain-language verdicts and case files** written for students.
5. A built-in **independent verification** button.

We're not trying to replace those tools. We're a front door that teaches people to think about trends correctly, using the same NASA data.

### Q26. Does your app "prove climate change"?
**Answer:** **No, and we say so carefully.** We **detect** trends; we don't **attribute** them. A significant warming trend at Svalbard tells you the temperature has changed beyond what natural year-to-year noise explains. It doesn't, on its own, tell you *why*. Attribution needs climate models with and without human forcing, which is what the IPCC detection-and-attribution work does.

Our verdicts deliberately say "is rising" and "very unlikely to be just chance", never "caused by". That distinction is itself something we want students to learn.

### Q27. How do you know students actually understand the results? Did you test with users?
**Answer:** *(Answer truthfully about what you did. If you didn't run formal user testing, say so.)*

The design choices are based on known misconceptions: "not significant = no change", and global versus local. That's why the app has the wizard, the definitions written for kids, the plain verdicts, the Patient Detective case and stripes that can be read at a glance.

**What we'd measure next:** a short pre/post quiz in a classroom pilot. For example: "If a trend is 'not yet significant', does that mean nothing is changing?" We'd also track how often users complete the case files and open the evidence cards. Teacher mode with worksheets is on the 3-month roadmap, partly for this reason.

### Q28. Your colour scales and visuals: are they accessible, including for colour-blind users?
**Answer:** We use **diverging palettes chosen per variable**: brown↔teal for water and blue↔red for temperature, which are both broadly colour-blind-safe pairings. Significance is shown with **solid versus faded**, not by colour alone, and every verdict is also given **in words**, with arrows and counts (▲/▼).

**What's missing:** a full WCAG audit, screen-reader labels for the chart and grid cells, and keyboard navigation of the map. That's honest future work.

## Section 5: Curveballs

### Q29. Pick one result your app shows and argue that it could be **wrong**.
**Answer (strong answer: shows scientific maturity):** "Monthly-anomaly wind speed. Three things could make a 'significant' result misleading:
1. **Reanalysis wind trends** are sensitive to changes in the observing system and to surface-roughness assumptions.
2. In anomaly mode, **AR(1) underestimates long-memory variability**, so the p-value may be too small.
3. If we scanned a grid, there's **no multiple-testing correction**.

So before trusting it, I'd check that the yearly mode agrees, look for a Pettitt change point near a known satellite transition, and compare with station data. Our app gives you the tools for most of those checks, and that's the point."

### Q30. If you had one more week, what single improvement would most increase scientific credibility, and why that over new features?
**Answer:** "**FDR-corrected field significance on the regional map, plus a confidence range for years-until-significant built from the full slope CI.** Two reasons:
1. The regional map is our headline visual for 'rising here, falling there', and it's currently the place most open to false positives.
2. The detectability meter is our most original feature, and making its uncertainty honest protects its credibility.

Both are small, well-defined changes to the existing engine, would be covered by the same parity tests, and make the app *more trustworthy*, not just bigger. New datasets like IMERG come after that."

---

# PART E: Things to memorise (cheat sheet)

| Fact | Value |
|---|---|
| Record length | 1981 to latest complete year (about 45 years). Solar and cloud variables from 1984 |
| Variables | 20, in 6 groups (Heat, Cold & snow, Water, Sun & sky, Wind) |
| Time slices | Yearly, every month (deseasonalised), 4 seasons, 12 single months |
| Data API | NASA POWER `/api/temporal/monthly/point`, community **AG** |
| Basemaps | NASA GIBS Blue Marble and VIIRS Black Marble (WMTS) |
| Significance level | α = 0.05, two-sided |
| n_eff | n(1−r₁)/(1+r₁), only if r₁ > 0, floor 3.01 (Santer 2000) |
| MK variance inflation | 1 + 2·Σ(1−k/n)·r₁ᵏ (Yue & Wang 2004) |
| Pettitt p | ≈ 2·exp(−6K²/(n³+n²)) |
| Weatherhead n* | [3.3·σ·√(12/m)/|ω| · √((1+φ)/(1−φ))]^(2/3); 3.3 ≈ 1.96 + 1.28 → 5% level, 90% power |
| Verdicts | Case closed (both significant) · Detectives disagree (one) · Not enough evidence yet (neither) |
| Grid | 3×3 to 7×7, spans 4° to 32°, 4 concurrent requests, longitude ÷ cos(lat) |
| Casebook code | `XXXX-XXXX`, 32-symbol alphabet → about 1.1 × 10¹² codes |
| Sync | Debounced 700 ms, on focus, per-case LWW, tombstone deletes, 400 KB / 300-case limits |
| Verification | Python matches SciPy linregress/theilslopes; TypeScript matches Python on a shared fixture (tests at 1e-6 to 1e-8, observed about 1e-15) |
| Stack | React 19, TypeScript 5.7, Vite 6, Leaflet, Recharts · Python 3.13, FastAPI, NumPy/SciPy · Netlify + Blobs · Render |

**Three honest limitations, so you can raise them first if asked "what are the weaknesses?":**
1. Reanalysis grid (about 50 km), so it's not hyper-local (urban heat islands).
2. No multiple-testing correction on the regional grid yet.
3. AR(1) is the simplest memory model; long-memory variability can make p-values optimistic.

Each one has a concrete fix on our roadmap, so say the fix in the same breath.
