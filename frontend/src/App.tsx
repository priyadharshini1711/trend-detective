import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView, { type GridCell } from './components/MapView';
import TrendChart from './components/TrendChart';
import { Heatmap, Stripes } from './components/Stripes';
import { DetectMeter, EvidenceCards } from './components/Evidence';
import { CaseFiles, Controls, Wizard } from './components/Panels';
import { MyCases } from './components/Casebook';
import { loadTrail, newId, saveTrail, snapKey, useCasebook, type SavedCase, type Snapshot } from './lib/casebook';
import { buildSeries, fetchPoint, pool, type PowerSeries } from './lib/power';
import { analyze, type FullResult } from './lib/stats';
import { CASE_FILES, fmtSlope, verdict, type CaseFile, type CaseStep, type Place } from './lib/story';
import { rampStops } from './lib/colors';
import { VAR, modeLabel, type Mode } from './lib/variables';

type Side = 'wizard' | 'controls' | 'cases' | 'mine';
type View = 'chart' | 'stripes' | 'heatmap';

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  return {
    lat: h.has('lat') ? +h.get('lat')! : 78.22, lon: h.has('lon') ? +h.get('lon')! : 15.65,
    place: h.get('place') ?? 'Svalbard, Norway', param: h.get('v') && VAR[h.get('v')!] ? h.get('v')! : 'T2M',
    mode: (h.get('m') as Mode) ?? 'annual', caseId: h.get('case'),
  };
}

const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export default function App() {
  const init = useMemo(readHash, []);
  const [lat, setLat] = useState(init.lat);
  const [lon, setLon] = useState(init.lon);
  const [place, setPlace] = useState(init.place);
  const [param, setParam] = useState(init.param);
  const [mode, setMode] = useState<Mode>(init.mode);
  const [ar1, setAr1] = useState(true);
  const [side, setSide] = useState<Side>(init.caseId ? 'cases' : 'wizard');
  const [view, setView] = useState<View>('chart');
  const [flyKey, setFlyKey] = useState('init');

  const [data, setData] = useState<PowerSeries | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [region, setRegion] = useState<{ lat: number; lon: number; span: number; n: number } | null>(null);
  const [cells, setCells] = useState<GridCell[]>([]);
  const [regionDone, setRegionDone] = useState(0);
  const [gridN, setGridN] = useState(5);
  const [gridSpan, setGridSpan] = useState(12);

  const [activeCase, setActiveCase] = useState<CaseFile | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [py, setPy] = useState<{ status: 'idle' | 'busy' | 'ok' | 'err'; res?: any; msg?: string }>({ status: 'idle' });

  const v = VAR[param];

  // ---------- personal casebook + investigation trail ----------
  const book = useCasebook();
  const [openId, setOpenId] = useState<string | null>(null);
  const snap: Snapshot = useMemo(() => ({ lat, lon, place, param, mode, ar1, view, region, gridN, gridSpan }),
    [lat, lon, place, param, mode, ar1, view, region, gridN, gridSpan]);
  const openCase = book.cases.find(c => c.id === openId) ?? null;
  const dirty = !!openCase && snapKey(openCase.snap) !== snapKey(snap);

  const restore = useCallback((s: Snapshot) => {
    setPlaying(false);
    setLat(s.lat); setLon(s.lon); setPlace(s.place); setParam(VAR[s.param] ? s.param : 'T2M'); setMode(s.mode as Mode);
    setAr1(s.ar1); setView(s.view); setRegion(s.region); setGridN(s.gridN); setGridSpan(s.gridSpan);
    setFlyKey(`restore${s.lat},${s.lon},${Date.now()}`);
  }, []);

  const [trail, setTrail] = useState(loadTrail);
  useEffect(() => {
    const id = window.setTimeout(() => setTrail(t => {
      const cur = t.list[t.idx];
      if (cur && snapKey(cur.snap) === snapKey(snap)) return t;
      const list = [...t.list.slice(0, t.idx + 1), { snap, at: Date.now() }].slice(-60);
      const next = { list, idx: list.length - 1 };
      saveTrail(next); return next;
    }), 800);
    return () => clearTimeout(id);
  }, [snap]);
  const jumpTrail = (i: number) => {
    const e = trail.list[i]; if (!e) return;
    const next = { ...trail, idx: i }; setTrail(next); saveTrail(next); restore(e.snap);
  };

  // ---------- fetch point data ----------
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true); setError(null); setPy({ status: 'idle' });
    fetchPoint(param, lat, lon, ac.signal)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { if (e?.name !== 'AbortError') { setError(String(e?.message ?? e)); setLoading(false); } });
    return () => ac.abort();
  }, [param, lat, lon]);

  useEffect(() => {
    const h = new URLSearchParams({ lat: lat.toFixed(2), lon: lon.toFixed(2), place, v: param, m: mode });
    history.replaceState(null, '', '#' + h.toString());
  }, [lat, lon, place, param, mode]);

  const series = useMemo(() => (data && data.param === param ? buildSeries(data, mode) : null), [data, param, mode]);
  const result: FullResult | null = useMemo(() => {
    if (!series || series.t.length < 8) return null;
    try { return analyze(series.t, series.y, series.ppy, 0.05, ar1); } catch { return null; }
  }, [series, ar1]);
  const story = result ? verdict(result, param, mode, place) : null;

  // ---------- regional grid ----------
  useEffect(() => {
    if (!region) { setCells([]); return; }
    const { n, span } = region;
    const step = span / n;
    const half: [number, number] = [step / 2, step / 2 / Math.max(0.35, Math.cos((region.lat * Math.PI) / 180)) * 1];
    const lonStep = half[1] * 2;
    const init: GridCell[] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const la = Math.max(-89, Math.min(89, region.lat + (i - (n - 1) / 2) * step));
      const lo = ((region.lon + (j - (n - 1) / 2) * lonStep + 540) % 360) - 180;
      init.push({ lat: la, lon: lo, half });
    }
    setCells(init); setRegionDone(0);
    const ac = new AbortController();
    const live = [...init];
    pool(init, 4, async (c, i) => {
      const d = await fetchPoint(param, c.lat, c.lon, ac.signal);
      const s = buildSeries(d, mode);
      const r = analyze(s.t, s.y, s.ppy, 0.05, ar1);
      live[i] = { ...c, slope: r.mk.senSlope, p: r.mk.p };
      setCells([...live]);
    }, k => setRegionDone(k)).then(res => {
      res.forEach((r, i) => { if (r instanceof Error) live[i] = { ...live[i], err: r.message.slice(0, 80) }; });
      setCells([...live]);
    }).catch(() => {});
    return () => ac.abort();
  }, [region, param, mode, ar1]);

  const scale = useMemo(() => {
    const s = cells.map(c => Math.abs(c.slope ?? 0)).filter(x => x > 0).sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length * 0.9)] || s[s.length - 1] : 1;
  }, [cells]);
  const regionStats = useMemo(() => {
    const ok = cells.filter(c => c.slope !== undefined);
    return { up: ok.filter(c => c.p! < 0.05 && c.slope! > 0).length, down: ok.filter(c => c.p! < 0.05 && c.slope! < 0).length, ns: ok.filter(c => c.p! >= 0.05).length };
  }, [cells]);

  // ---------- actions ----------
  const goTo = useCallback((la: number, lo: number, name?: string) => {
    setLat(Math.round(la * 100) / 100); setLon(Math.round(lo * 100) / 100);
    setPlace(name ?? `${la.toFixed(2)}°, ${lo.toFixed(2)}°`);
  }, []);

  const applyStep = useCallback((s: CaseStep) => {
    if (s.lat !== undefined && s.lon !== undefined) { goTo(s.lat, s.lon, s.place); setFlyKey(`${s.lat},${s.lon},${Date.now()}`); }
    if (s.param) setParam(s.param);
    if (s.mode) setMode(s.mode);
    if (s.tab) setView(s.tab);
    if (s.region === null) setRegion(null);
    else if (s.region) {
      const la = s.lat ?? lat, lo = s.lon ?? lon;
      setRegion({ lat: la, lon: lo, ...s.region }); setFlyKey(`r${la},${lo},${Date.now()}`);
    }
  }, [goTo, lat, lon]);

  const startCase = (c: CaseFile) => { setActiveCase(c); setStep(0); applyStep(c.steps[0]); setSide('cases'); };
  const gotoStep = (i: number) => {
    if (!activeCase) return;
    // replay cumulative state so jumping around stays consistent
    for (let k = 0; k <= i; k++) applyStep(activeCase.steps[k]);
    setStep(i);
  };
  useEffect(() => { if (init.caseId) { const c = CASE_FILES.find(x => x.id === init.caseId); if (c) startCase(c); } }, []); // eslint-disable-line

  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !activeCase) return;
    timer.current = window.setTimeout(() => {
      if (step < activeCase.steps.length - 1) gotoStep(step + 1); else setPlaying(false);
    }, 9000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [playing, step, activeCase]); // eslint-disable-line

  const verifyPython = async () => {
    if (!series) return;
    const base = API_URL || (() => { try { return localStorage.getItem('td_api') ?? ''; } catch { return ''; } })();
    if (!base) { setPy({ status: 'err', msg: 'No Python API configured. Set VITE_API_URL at build time (see README).' }); return; }
    setPy({ status: 'busy' });
    try {
      const r = await fetch(base.replace(/\/$/, '') + '/api/analyze', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ t: series.t, y: series.y, points_per_year: series.ppy, ar1 }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPy({ status: 'ok', res: await r.json() });
    } catch (e: any) { setPy({ status: 'err', msg: `Python API unreachable (${e.message}). Free hosts sleep — try again in 30 s.` }); }
  };

  const downloadCSV = () => {
    if (!series) return;
    const rows = ['time,value', ...series.t.map((t, i) => `${t.toFixed(4)},${series.y[i]}`)];
    const blob = new Blob([`# NASA POWER ${param} (${v.unit}) at ${lat},${lon} — ${modeLabel(mode)}\n` + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `trend-detective_${param}_${lat}_${lon}_${mode}.csv`; a.click();
  };

  const [lo, mid, hi] = rampStops(v.palette);

  const summary = (): Partial<SavedCase> => (!loading && result && story
    ? { tone: story.tone, trend: fmtSlope(result.mk.senSlope, v.unit), headline: story.headline } : {});
  const createCase = (name: string, notes: string) => {
    const now = Date.now(), id = newId();
    book.upsert({ id, name, notes, snap, ...summary(), createdAt: now, updatedAt: now });
    setOpenId(id);
  };
  const saveProgress = () => { if (openCase) book.upsert({ ...openCase, snap, ...summary() }); };
  // fill in the verdict stamp once data arrives for a case saved while still loading
  useEffect(() => {
    if (openCase && !dirty && !loading && result && story && openCase.headline !== story.headline)
      book.upsert({ ...openCase, ...summary() });
  }, [openCase, dirty, loading, result, story?.headline]); // eslint-disable-line

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">🔎</span>
          <div><h1>Trend Detective</h1><p>Is Earth really changing where <i>you</i> care about? Interrogate 45 years of NASA data.</p></div>
        </div>
        <nav className="side-tabs">
          {(['wizard', 'cases', 'mine', 'controls'] as Side[]).map(s => (
            <button key={s} className={side === s ? 'on' : ''} onClick={() => setSide(s)}>
              {s === 'wizard' ? '🧭 Start here' : s === 'cases' ? '📁 Case files' : s === 'mine' ? '🗂 My cases' : '🛠 Lab controls'}
            </button>
          ))}
        </nav>
      </header>

      <main>
        <aside className="side">
          {side === 'wizard' && <Wizard onApply={(p: Place | null, k) => { if (p) { goTo(p.lat, p.lon, p.name); setFlyKey(p.name + Date.now()); } setParam(k); }} />}
          {side === 'controls' && <Controls param={param} mode={mode} ar1={ar1} lat={lat} lon={lon} onParam={setParam} onMode={setMode} onAr1={setAr1}
            onLatLon={(a, b) => { if (isFinite(a) && isFinite(b)) goTo(a, b); }} />}
          {side === 'cases' && <CaseFiles active={activeCase} step={step} playing={playing} onStart={startCase} onStep={gotoStep}
            onStop={() => { setActiveCase(null); setPlaying(false); }} onPlay={setPlaying} />}
          {side === 'mine' && <MyCases code={book.code} status={book.status} lastSync={book.lastSync} onLink={book.linkBook} onSyncNow={book.syncNow}
            cases={book.cases} openCase={openCase} dirty={dirty} current={snap} defaultName={`${place} — ${v.label}`}
            onCreate={createCase} onSaveProgress={saveProgress} onRevert={() => openCase && restore(openCase.snap)}
            onOpen={c => { setOpenId(c.id); restore(c.snap); }} onClose={() => setOpenId(null)}
            onDelete={c => { book.remove(c.id); if (openId === c.id) setOpenId(null); }}
            onNotes={(c, notes) => book.upsert({ ...c, notes })}
            trail={trail.list} trailIdx={trail.idx} onJump={jumpTrail} />}

          <div className="region-box">
            <h4>🗺️ Regional trend map</h4>
            <p className="muted small">Run the same test on a grid of points around here. Watch one variable rise in one place and fall in another.</p>
            <div className="row">
              <label>Grid <select value={gridN} onChange={e => setGridN(+e.target.value)}>{[3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}×{n}</option>)}</select></label>
              <label>Size <select value={gridSpan} onChange={e => setGridSpan(+e.target.value)}>{[4, 8, 12, 16, 24, 32].map(n => <option key={n} value={n}>{n}°</option>)}</select></label>
            </div>
            <div className="row">
              <button className="primary" onClick={() => { setRegion({ lat, lon, span: gridSpan, n: gridN }); setFlyKey('reg' + Date.now()); }}>Scan region</button>
              {region && <button onClick={() => setRegion(null)}>Clear</button>}
            </div>
            {region && <div className="small mono">{regionDone}/{cells.length} points · <span style={{ color: hi }}>▲{regionStats.up}</span> · <span style={{ color: lo }}>▼{regionStats.down}</span> · {regionStats.ns} not sig.</div>}
          </div>
        </aside>

        <section className="stage">
          <div className="map-wrap">
            <MapView lat={lat} lon={lon} onPick={(a, b) => { goTo(a, b); }} cells={cells} palette={v.palette} scale={scale} unit={v.unit}
              onCell={c => goTo(c.lat, c.lon)} flyKey={flyKey} />
            {cells.length > 0 && <div className="legend">
              <div className="legend-bar" style={{ background: `linear-gradient(90deg, ${lo}, ${mid}, ${hi})` }} />
              <div className="legend-lab mono"><span>{fmtSlope(-scale, v.unit)}</span><span>0</span><span>{fmtSlope(scale, v.unit)}</span></div>
              <div className="small muted">solid = significant (Mann-Kendall p&lt;0.05) · faded/dashed = not yet</div>
            </div>}
            <div className="map-hint">Click anywhere on Earth to investigate it</div>
          </div>

          <div className="results">
            <div className="res-head">
              <div>
                <div className="kicker">{v.icon} {v.label} · {modeLabel(mode)} · NASA POWER / {v.source}</div>
                <h2>📍 {place}</h2>
                {openCase && <div className={`case-badge ${dirty ? 'dirty' : ''}`}>🗂 {openCase.name} · {dirty
                  ? <>● unsaved — <button className="link" onClick={() => restore(openCase.snap)}>return to saved checkpoint</button></> : '✓ all changes saved'}</div>}
              </div>
              <div className="history">
                <button title="Back to previous checkpoint" disabled={trail.idx <= 0} onClick={() => jumpTrail(trail.idx - 1)}>↶ Back</button>
                <button title="Forward" disabled={trail.idx >= trail.list.length - 1} onClick={() => jumpTrail(trail.idx + 1)}>↷ Forward</button>
                <button className={dirty ? 'primary' : ''} title={openCase ? 'Save progress to your case' : 'Save as a case file'}
                  onClick={() => { if (openCase) saveProgress(); else setSide('mine'); }}>
                  {openCase ? (dirty ? '💾 Save' : '✓ Saved') : '📌 Save case'}
                </button>
              </div>
              <div className="views">
                {(['chart', 'stripes', 'heatmap'] as View[]).map(k => (
                  <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{k === 'chart' ? '📈 Trend' : k === 'stripes' ? '🟥 Stripes' : '🗓 Every month'}</button>
                ))}
              </div>
            </div>

            {loading && <div className="loading"><span className="spinner" /> Requesting 45 years of data from NASA POWER…</div>}
            {error && !loading && <div className="error">⚠ Couldn't get this data: {error}. Ocean points or very new variables may have gaps — try another variable or spot.</div>}

            {result && series && story && !loading && <>
              <div className={`verdict ${story.tone}`} style={story.tone === 'up' || story.tone === 'down' ? { borderLeftColor: story.tone === 'up' ? hi : lo, color: story.tone === 'up' ? hi : lo } : undefined}>
                <div className="v-stamp">{story.tone === 'flat' ? 'OPEN CASE' : story.tone === 'mixed' ? 'INCONCLUSIVE' : 'CASE CLOSED'}</div>
                <h3>{story.headline}</h3>
                <p>{story.body}</p>
              </div>

              {view === 'chart' && <TrendChart t={series.t} y={series.y} r={result} unit={v.unit} anomaly={mode === 'anomaly'} />}
              {view === 'stripes' && <Stripes t={series.t} y={series.y} palette={v.palette} unit={v.unit} />}
              {view === 'heatmap' && <Heatmap grid={series.anomalyGrid} palette={v.palette} unit={v.unit} />}

              <EvidenceCards r={result} unit={v.unit} ar1={ar1} />
              <DetectMeter r={result} />

              <div className="tools">
                <button onClick={verifyPython} disabled={py.status === 'busy'}>🐍 {py.status === 'busy' ? 'Asking Python…' : 'Verify with Python (SciPy)'}</button>
                <button onClick={downloadCSV}>⬇ Download data (CSV)</button>
                <button onClick={() => navigator.clipboard?.writeText(location.href)}>🔗 Copy share link</button>
                <span className="muted small">{result.n} data points · {result.startYear}–{result.endYear}</span>
              </div>
              {py.status === 'err' && <div className="error small">{py.msg}</div>}
              {py.status === 'ok' && <Parity js={result} py={py.res} />}
            </>}
          </div>
        </section>
      </main>
      <footer>
        Data: <a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">NASA POWER</a> (MERRA-2 reanalysis, CERES radiation) · Basemap: NASA GIBS ·
        Methods: OLS + AR(1) correction (Santer 2000), Mann-Kendall + Sen (Yue & Wang 2004), Pettitt (1979), detectability (Weatherhead et al. 1998) ·
        Built for NASA Space Apps 2026 — Earth System Trend Detective
      </footer>
    </div>
  );
}

function Parity({ js, py }: { js: FullResult; py: any }) {
  const rows: [string, number, number][] = [
    ['OLS slope', js.ols.slope, py.ols.slope], ['OLS p-value', js.ols.p, py.ols.p], ['OLS 95% CI low', js.ols.ciLow, py.ols.ciLow],
    ['Mann-Kendall p', js.mk.p, py.mk.p], ['Sen slope', js.mk.senSlope, py.mk.senSlope], ['Years needed (n*)', js.detect.nStar, py.detect.nStar],
  ];
  return (
    <div className="parity">
      <div className="small"><b>Independent check:</b> the browser engine (TypeScript) vs the FastAPI engine ({py.engine}).</div>
      <table className="mono small"><thead><tr><th>Statistic</th><th>Browser</th><th>Python</th><th>Δ</th></tr></thead>
        <tbody>{rows.map(([k, a, b]) => <tr key={k}><td>{k}</td><td>{a.toPrecision(6)}</td><td>{b.toPrecision(6)}</td><td className={Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)) ? 'ok' : 'bad'}>{Math.abs(a - b).toExponential(1)}</td></tr>)}</tbody></table>
    </div>
  );
}
