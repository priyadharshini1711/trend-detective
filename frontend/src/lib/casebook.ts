import { useCallback, useEffect, useRef, useState } from 'react';
import { isBookCode, mergeCases, sanitizeCases, type SavedCase, type Snapshot } from './caseMerge';

export type { SavedCase, Snapshot } from './caseMerge';
export { isBookCode } from './caseMerge';

const LS_CASES = 'td_cases_v1';
const LS_CODE = 'td_book_code';
const LS_TRAIL = 'td_trail_v1';
const ENDPOINT = '/.netlify/functions/cases';

const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export const snapKey = (s: Snapshot) =>
  JSON.stringify([s.lat, s.lon, s.place, s.param, s.mode, s.ar1, s.view, s.region, s.gridN, s.gridSpan]);

const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newBookCode() {
  const r = crypto.getRandomValues(new Uint8Array(8));
  let s = '';
  r.forEach((b, i) => { s += ALPH[b % 32]; if (i === 3) s += '-'; });
  return s;
}
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export type SyncStatus = 'syncing' | 'synced' | 'offline';

/** Personal casebook: saved on this device instantly, synced to Netlify Blobs under a casebook code. */
export function useCasebook() {
  const [code, setCode] = useState<string>(() => {
    const c = lsGet(LS_CODE);
    if (c && isBookCode(c)) return c;
    const n = newBookCode(); lsSet(LS_CODE, n); return n;
  });
  const [all, setAll] = useState<SavedCase[]>(() => { try { return sanitizeCases(JSON.parse(lsGet(LS_CASES) ?? '[]')); } catch { return []; } });
  const [status, setStatus] = useState<SyncStatus>('syncing');
  const [lastSync, setLastSync] = useState<number | null>(null);
  const allRef = useRef(all); allRef.current = all;
  const codeRef = useRef(code); codeRef.current = code;
  const timer = useRef<number | null>(null);

  const store = (list: SavedCase[]) => { allRef.current = list; setAll(list); lsSet(LS_CASES, JSON.stringify(list)); };

  const sync = useCallback(async () => {
    const book = codeRef.current;
    setStatus('syncing');
    try {
      const r = await fetch(`${ENDPOINT}?book=${book}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cases: allRef.current }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (book !== codeRef.current) return; // switched books mid-flight
      store(mergeCases(allRef.current, sanitizeCases(j.cases)));
      setStatus('synced'); setLastSync(Date.now());
    } catch { setStatus('offline'); }
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(sync, 700);
  }, [sync]);

  // first sync + pull again whenever the tab regains focus (picks up other devices' changes)
  useEffect(() => {
    sync();
    const onFocus = () => sync();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [sync, code]);

  const upsert = useCallback((c: SavedCase) => {
    store(mergeCases(allRef.current, [{ ...c, updatedAt: Math.max(Date.now(), c.updatedAt + 1) }]));
    schedule();
  }, [schedule]);

  const remove = useCallback((id: string) => {
    const c = allRef.current.find(x => x.id === id);
    if (!c) return;
    store(mergeCases(allRef.current, [{ ...c, deleted: true, updatedAt: Date.now() }]));
    schedule();
  }, [schedule]);

  /** Link this device to another casebook code. Local cases are merged in, nothing is lost. */
  const linkBook = useCallback((c: string) => {
    const n = c.trim().toUpperCase();
    if (!isBookCode(n)) return false;
    lsSet(LS_CODE, n); codeRef.current = n; setCode(n);
    return true;
  }, []);

  return { code, cases: all.filter(c => !c.deleted), status, lastSync, upsert, remove, linkBook, syncNow: sync };
}

/** Automatic investigation trail (undo/redo history) for this device. */
export interface TrailEntry { snap: Snapshot; at: number }
export function loadTrail(): { list: TrailEntry[]; idx: number } {
  try {
    const t = JSON.parse(lsGet(LS_TRAIL) ?? 'null');
    if (t && Array.isArray(t.list) && t.list.length) return { list: t.list, idx: Math.min(t.idx ?? t.list.length - 1, t.list.length - 1) };
  } catch { /* ignore */ }
  return { list: [], idx: -1 };
}
export const saveTrail = (t: { list: TrailEntry[]; idx: number }) => lsSet(LS_TRAIL, JSON.stringify(t));
