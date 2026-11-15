# Trend Detective — Project page text (NASA Space Apps 2026)

## Project name
Trend Detective

## High-level summary (≈150 words)
Climate headlines talk about global averages, but people care about *their* place: is my city getting hotter at night? Is the rain coming back to the Sahel? Trend Detective is a web app that lets anyone, students included, put a point on Earth "on trial". A two-question wizard ("What kind of place?", "What are you curious about?") suggests NASA variables in plain language. The app then pulls 45 years of NASA MERRA-2 and CERES data live from NASA POWER and runs two independent "detectives" on it: a straight-line OLS test with a correction for autocorrelation, and a Mann-Kendall rank test with Sen's slope. Together they give a verdict anyone can read. When a trend isn't significant yet, Trend Detective estimates **how many more years of data would be needed** to detect it (Weatherhead et al. 1998). A regional grid shows that the same variable can rise in one place and fall in another.

## Project details
**What it does**
- **Detective wizard** for students: place type + curiosity → suggested variables, each with a one-line kid-friendly definition and its NASA source.
- **Click anywhere on Earth** on a NASA GIBS Blue Marble / Black Marble map.
- **20 variables** from NASA POWER: temperature (mean, max, min, range, skin), rainfall, snowfall, snow depth, frost days, root-zone and surface soil wetness, evapotranspiration, humidity, cloud cover, sunlight, wind and pressure.
- **Time slices:** yearly averages, every month with the seasonal cycle removed, single seasons (DJF/MAM/JJA/SON) or single months.
- **Statistics covering the brief:** OLS slope with 95% CI and t-test; Mann-Kendall + Sen's slope with CI; an autocorrelation correction for both (Santer 2000; Yue & Wang 2004); and a Pettitt change-point test to tell a steady ramp from a sudden shift.
- **⏳ Years-until-significant meter:** for "not yet" trends, estimates the record length needed for ~90% detection probability, with an uncertainty range.
- **🗺️ Regional trend map:** a grid of up to 7×7 points, each with its own test. Solid cells are significant and faded cells are not yet, coloured with a diverging palette chosen per variable (brown↔teal for water, blue↔red for heat).
- **📁 Case files:** five guided, auto-playing investigations (The Melting North, Sahel: Return of the Rains?, Rising Here Falling There, The Patient Detective, Hot Nights in the City).
- **Three views:** trend chart, climate stripes, and a month × year anomaly heat-map.
- **🐍 Verify with Python:** sends the exact series to a FastAPI + SciPy backend and shows the browser and Python results side by side. They agree to about 1e-15.
- Plain-language verdicts ("Case closed", "Open case", "Inconclusive"), CSV download and shareable links.

**How it works / tech**
React 19 + TypeScript + Vite front end, hosted on Netlify. All statistics run in the browser, so the app needs no login and no server and keeps working even if the backend sleeps. NASA POWER requests go through a Netlify proxy, with a direct fallback. The Python 3.13 FastAPI backend (NumPy/SciPy) re-implements the same engine, provides `/api/analyze`, `/api/trend` and `/api/region`, and is unit-tested against `scipy.stats.linregress` and `theilslopes`. A shared test fixture makes sure the TypeScript and Python engines can't drift apart.

**Benefits / impact**
It turns the abstract question "is this trend real?" into something a student can explore in two clicks, while staying statistically honest: autocorrelation is corrected, two independent tests have to agree, and "we can't tell yet" is a legitimate, quantified answer.

**What's next**
Trend comparison between two places, more datasets (GPM IMERG, MODIS NDVI, GRACE groundwater), a teacher mode with worksheets, and offline caching of the case files.

## NASA data used
- NASA POWER monthly point API: https://power.larc.nasa.gov/ (GMAO MERRA-2 meteorology; CERES radiation and clouds)
- NASA GIBS imagery (Blue Marble, VIIRS Black Marble): https://nasa-gibs.github.io/gibs-api-docs/

## References
Weatherhead, E. C. et al. (1998) Factors affecting the detection of trends, *JGR* 103(D14). · Santer, B. D. et al. (2000) Statistical significance of trends…, *JGR* 105(D6). · Yue, S. & Wang, C. (2004) The Mann-Kendall test modified by effective sample size, *Water Resour. Manage.* 18. · Sen, P. K. (1968) *JASA* 63. · Pettitt, A. N. (1979) *Appl. Stat.* 28.

## Use of AI
Code and text were developed with help from Claude (Anthropic). All statistical methods are cited, and the implementation is verified by unit tests against SciPy.

---

# 🎬 Demo video script (≤ 2 min, single presenter)

Record your screen with OBS or the Windows Game Bar (Win+Alt+R) at 1080p.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:12 | Landing page, Svalbard verdict visible | "Climate change is global, but people live locally. Trend Detective lets anyone ask NASA's data: is *my* place really changing?" |
| 0:12–0:30 | Start here → Big city → Is it getting hotter? → click a suggestion | "Two questions and it suggests NASA variables in plain language: MERRA-2 temperature, soil moisture, CERES sunlight…" |
| 0:30–0:50 | Trend chart + the two detective cards (tap one to expand) | "Two independent detectives: a straight-line test corrected for autocorrelation, and the Mann-Kendall rank test with Sen's slope. When both agree: case closed." |
| 0:50–1:10 | Switch variable to a noisy one (wind) → Years-until-significant meter | "When a trend isn't clear yet, we don't just say 'no'. Using Weatherhead et al., we estimate how many more years of data we'd need." |
| 1:10–1:35 | Case files → Rising Here, Falling There → Next clue (grid loads) | "Here's the challenge's key idea: the same variable, rising in one place and falling a few hundred kilometres away." |
| 1:35–1:50 | Stripes / Every month tabs, then Verify with Python | "Climate stripes, a month-by-month heat-map, and every number double-checked by an independent Python and SciPy engine." |
| 1:50–2:00 | Logo / URL | "Trend Detective: open data, honest statistics, for every place on Earth." |

---

# 🔗 Links checklist (paste after deploying)

| Field | Where to get it | Link |
|---|---|---|
| Live app | Netlify → Site overview | `https://<your-site>.netlify.app` |
| Source code | GitHub repo (public) | `https://github.com/<you>/trend-detective` |
| Demo (30-second video) | Upload `docs/demo/Trend-Detective-Demo-30s.mp4` to YouTube (Unlisted or Public) or Google Drive ("Anyone with the link") | `https://...` |
| Demo (slides, alternative) | Upload `docs/Trend-Detective-Presentation.pdf` to Google Drive ("Anyone with the link") | `https://...` |

After pasting the links, replace the `[paste … URL]` text on slides 1 and 7 of `docs/Trend-Detective-Presentation.pptx`, then re-export the PDF (File → Export → PDF).
Architecture diagrams (current + Azure): `docs/ARCHITECTURE.md`.
