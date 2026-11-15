// Shared by the browser, the Netlify Function (production) and the Vite dev server (local).
// Keep this file free of browser/Node-only APIs.

export type Tone = 'up' | 'down' | 'flat' | 'mixed';

export interface Snapshot {
  lat: number; lon: number; place: string; param: string; mode: string; ar1: boolean;
  view: 'chart' | 'stripes' | 'heatmap';
  region: { lat: number; lon: number; span: number; n: number } | null;
  gridN: number; gridSpan: number;
}

export interface SavedCase {
  id: string; name: string; notes: string; snap: Snapshot;
  tone?: Tone; trend?: string; headline?: string;
  createdAt: number; updatedAt: number;
  deleted?: boolean; // tombstone so deletes sync across devices
}

export const BOOK_CODE_RE = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;
export const isBookCode = (s: string) => BOOK_CODE_RE.test(s);
export const MAX_CASES = 300;

/** Per-case last-write-wins merge. */
export function mergeCases(a: SavedCase[], b: SavedCase[]): SavedCase[] {
  const m = new Map<string, SavedCase>();
  for (const c of [...a, ...b]) {
    const cur = m.get(c.id);
    if (!cur || c.updatedAt > cur.updatedAt) m.set(c.id, c);
  }
  return [...m.values()].sort((x, y) => y.updatedAt - x.updatedAt).slice(0, MAX_CASES);
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);

/** Defensive cleanup of data coming over the wire. */
export function sanitizeCases(input: unknown): SavedCase[] {
  if (!Array.isArray(input)) return [];
  const out: SavedCase[] = [];
  for (const raw of input.slice(0, MAX_CASES * 2)) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, any>;
    const s = (c.snap ?? {}) as Record<string, any>;
    const id = str(c.id, 40);
    if (!id) continue;
    const r = s.region && typeof s.region === 'object'
      ? { lat: num(s.region.lat), lon: num(s.region.lon), span: num(s.region.span, 12), n: Math.min(9, Math.max(2, num(s.region.n, 5))) }
      : null;
    out.push({
      id, name: str(c.name, 120), notes: str(c.notes, 4000),
      snap: {
        lat: num(s.lat), lon: num(s.lon), place: str(s.place, 120), param: str(s.param, 40), mode: str(s.mode, 12),
        ar1: s.ar1 !== false, view: (['chart', 'stripes', 'heatmap'].includes(s.view) ? s.view : 'chart'),
        region: r, gridN: num(s.gridN, 5), gridSpan: num(s.gridSpan, 12),
      },
      tone: (['up', 'down', 'flat', 'mixed'].includes(c.tone) ? c.tone : undefined),
      trend: str(c.trend, 60) || undefined, headline: str(c.headline, 300) || undefined,
      createdAt: num(c.createdAt, Date.now()), updatedAt: num(c.updatedAt, Date.now()),
      deleted: c.deleted === true || undefined,
    });
  }
  return out;
}
