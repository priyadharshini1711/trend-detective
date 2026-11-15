// NASA POWER (MERRA-2 + CERES) monthly point API client, with caching and fallbacks.
import type { Mode } from './variables';

export type Monthly = Map<number, (number | null)[]>; // year -> 12 monthly values
export interface PowerSeries { param: string; lat: number; lon: number; monthly: Monthly; annual: Map<number, number | null>; units?: string }

// On Netlify, /power/* is proxied to power.larc.nasa.gov (see netlify.toml) so CORS can never bite.
// In dev, Vite proxies /power. If the proxy fails we fall back to calling NASA directly.
const BASES = ['/power', 'https://power.larc.nasa.gov'];
const memo = new Map<string, Promise<PowerSeries>>();

function cacheGet(k: string): any | null {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; }
}
function cacheSet(k: string, v: any) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota or privacy mode */ }
}

async function getJSON(path: string, signal?: AbortSignal): Promise<any> {
  let lastErr: unknown;
  for (const base of BASES) {
    try {
      const r = await fetch(base + path, { signal });
      if (r.status === 422 || r.status === 400) {
        const body = await r.json().catch(() => ({}));
        throw Object.assign(new Error(JSON.stringify(body.messages ?? body.message ?? body)), { status: r.status });
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') ?? '';
      if (!ct.includes('json')) throw new Error('Not JSON (proxy missing?)');
      return await r.json();
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      if (e?.status) throw e; // real API validation error, don't retry elsewhere
      lastErr = e;
    }
  }
  throw lastErr;
}

export function fetchPoint(param: string, lat: number, lon: number, signal?: AbortSignal): Promise<PowerSeries> {
  lat = Math.round(lat * 100) / 100;
  lon = Math.round(lon * 100) / 100;
  const key = `td1:${param}:${lat}:${lon}`;
  let p = memo.get(key);
  if (!p) {
  // The shared request is never aborted (several callers may wait on it); each caller can stop waiting with its own signal.
  p = (async () => {
    let raw = cacheGet(key);
    if (!raw) {
      let err: any;
      for (const end of [2025, 2024]) {
        try {
          const json = await getJSON(`/api/temporal/monthly/point?parameters=${param}&community=AG&longitude=${lon}&latitude=${lat}&start=1981&end=${end}&format=JSON`);
          raw = { values: json.properties.parameter[param], units: json.parameters?.[param]?.units };
          cacheSet(key, raw);
          break;
        } catch (e: any) { err = e; if (!e?.status) break; }
      }
      if (!raw) throw err;
    }
    return parse(param, lat, lon, raw.values, raw.units);
  })();
  memo.set(key, p);
  p.catch(() => memo.delete(key));
  }
  if (!signal) return p;
  const shared = p;
  return new Promise<PowerSeries>((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    shared.then(resolve, reject);
  });
}

function parse(param: string, lat: number, lon: number, values: Record<string, number>, units?: string): PowerSeries {
  const monthly: Monthly = new Map();
  const annual = new Map<number, number | null>();
  for (const [k, v] of Object.entries(values)) {
    const y = +k.slice(0, 4), m = +k.slice(4);
    const val = v === -999 || v == null || !isFinite(v) ? null : v;
    if (m === 13) { annual.set(y, val); continue; }
    if (!monthly.has(y)) monthly.set(y, Array(12).fill(null));
    monthly.get(y)![m - 1] = val;
  }
  return { param, lat, lon, monthly, annual, units };
}

export interface BuiltSeries { t: number[]; y: number[]; ppy: number; climatology: number[]; anomalyGrid: { year: number; vals: (number | null)[] }[] }

const SEASON: Record<string, number[]> = { DJF: [12, 1, 2], MAM: [3, 4, 5], JJA: [6, 7, 8], SON: [9, 10, 11] };

/** Turn raw POWER data into the series analysed for a given mode. */
export function buildSeries(s: PowerSeries, mode: Mode): BuiltSeries {
  const years = [...s.monthly.keys()].sort((a, b) => a - b);
  // drop trailing incomplete year
  const complete = years.filter(y => s.monthly.get(y)!.every(v => v !== null));
  const clim = Array(12).fill(0).map((_, m) => {
    const vals = complete.map(y => s.monthly.get(y)![m]!) ;
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
  });
  const anomalyGrid = years.map(y => ({ year: y, vals: s.monthly.get(y)!.map((v, m) => (v === null ? null : v - clim[m])) }));
  const t: number[] = [], yv: number[] = [];
  let ppy = 1;
  if (mode === 'annual') {
    for (const y of complete) {
      const a = s.annual.get(y);
      const v = a ?? s.monthly.get(y)!.reduce((x: number, z) => x + (z ?? 0), 0) / 12;
      if (v !== null && v !== undefined) { t.push(y); yv.push(v); }
    }
  } else if (mode === 'anomaly') {
    ppy = 12;
    for (const y of years) s.monthly.get(y)!.forEach((v, m) => { if (v !== null) { t.push(y + (m + 0.5) / 12); yv.push(v - clim[m]); } });
  } else if (mode in SEASON) {
    for (const y of years) {
      const ms = SEASON[mode].map(m => ((mode as string) === 'DJF' && m === 12 ? s.monthly.get(y - 1)?.[11] : s.monthly.get(y)?.[m - 1]));
      if (ms.every(v => v !== null && v !== undefined)) { t.push(y); yv.push((ms as number[]).reduce((a, b) => a + b, 0) / 3); }
    }
  } else {
    const m = +mode.slice(1) - 1;
    for (const y of years) { const v = s.monthly.get(y)![m]; if (v !== null) { t.push(y); yv.push(v); } }
  }
  return { t, y: yv, ppy, climatology: clim, anomalyGrid };
}

/** Run async jobs with limited concurrency (POWER is a shared public service — be polite). */
export async function pool<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>, onDone?: (n: number) => void): Promise<(R | Error)[]> {
  const out: (R | Error)[] = Array(items.length);
  let next = 0, done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i], i); } catch (e: any) { if (e?.name === 'AbortError') throw e; out[i] = e instanceof Error ? e : new Error(String(e)); }
      onDone?.(++done);
    }
  }
  await Promise.all(Array(Math.min(limit, items.length)).fill(0).map(worker));
  return out;
}
