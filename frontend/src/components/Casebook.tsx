import { useEffect, useState } from 'react';
import { VAR, modeLabel, type Mode } from '../lib/variables';
import type { SavedCase, Snapshot, SyncStatus, TrailEntry } from '../lib/casebook';

const STAMP: Record<string, string> = { up: 'CLOSED', down: 'CLOSED', flat: 'OPEN', mixed: 'INCONCLUSIVE' };

export const snapLabel = (s: Snapshot) =>
  `${VAR[s.param]?.icon ?? ''} ${s.place} · ${VAR[s.param]?.label ?? s.param} · ${modeLabel(s.mode as Mode)}${s.view === 'stripes' ? ' · 🟥' : s.view === 'heatmap' ? ' · 🗓' : ''}${s.ar1 ? '' : ' · no AR(1)'}${s.region ? ` · 🗺️ ${s.region.n}×${s.region.n}` : ''}`;

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

export function MyCases(p: {
  code: string; status: SyncStatus; lastSync: number | null; onLink: (c: string) => boolean; onSyncNow: () => void;
  cases: SavedCase[]; openCase: SavedCase | null; dirty: boolean; current: Snapshot; defaultName: string;
  onCreate: (name: string, notes: string) => void; onSaveProgress: () => void; onRevert: () => void;
  onOpen: (c: SavedCase) => void; onClose: () => void; onDelete: (c: SavedCase) => void; onNotes: (c: SavedCase, notes: string) => void;
  trail: TrailEntry[]; trailIdx: number; onJump: (i: number) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkCode, setLinkCode] = useState('');
  const [linkErr, setLinkErr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draftNotes, setDraftNotes] = useState(p.openCase?.notes ?? '');
  useEffect(() => { setDraftNotes(p.openCase?.notes ?? ''); }, [p.openCase?.id, p.openCase?.notes]);

  const syncText = p.status === 'synced' ? `☁ synced${p.lastSync ? ' ' + ago(p.lastSync) : ''}`
    : p.status === 'syncing' ? '⟳ syncing…' : '⚠ offline — saved on this device, will sync later';

  return (
    <div className="mycases">
      <div className="sync-box">
        <div className="sync-row">
          <span className="small muted">Casebook code</span>
          <button className="code-pill mono" title="Copy code" onClick={() => { navigator.clipboard?.writeText(p.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {p.code} {copied ? '✓' : '⧉'}
          </button>
        </div>
        <div className={`small sync-${p.status}`}>
          {syncText} {p.status === 'offline' && <button className="link small" onClick={p.onSyncNow}>retry</button>}
        </div>
        {!linkOpen ? <button className="link small" onClick={() => setLinkOpen(true)}>Open your cases from another device →</button> : (
          <div className="row">
            <input className="mono" placeholder="ABCD-EFGH" value={linkCode} maxLength={9}
              onChange={e => { setLinkCode(e.target.value.toUpperCase()); setLinkErr(false); }} />
            <button className="primary" onClick={() => { if (p.onLink(linkCode)) { setLinkOpen(false); setLinkCode(''); } else setLinkErr(true); }}>Link</button>
            <button onClick={() => setLinkOpen(false)}>Cancel</button>
            {linkErr && <div className="small bad">Codes look like ABCD-EFGH.</div>}
            <div className="small muted">Your cases on this device are merged in. Nothing is lost.</div>
          </div>
        )}
      </div>

      {p.openCase ? (
        <div className="casefile open mine">
          <div className="stamp">MY CASE</div>
          <h3>{p.openCase.name}</h3>
          <div className={`save-state ${p.dirty ? 'dirty' : 'clean'}`}>
            {p.dirty ? <>● unsaved changes — <button className="link" onClick={p.onRevert}>return to saved checkpoint</button></> : '✓ all changes saved'}
          </div>
          <label className="small muted">Notes
            <textarea rows={3} value={draftNotes} onChange={e => setDraftNotes(e.target.value)}
              onBlur={() => { if (draftNotes !== p.openCase!.notes) p.onNotes(p.openCase!, draftNotes); }}
              placeholder="What did you find? What do you want to check next?" />
          </label>
          <div className="row">
            <button className="primary" disabled={!p.dirty} onClick={p.onSaveProgress}>💾 Save progress</button>
            <button onClick={p.onClose}>Close case</button>
          </div>
        </div>
      ) : creating ? (
        <div className="casefile open mine">
          <div className="stamp">NEW CASE</div>
          <label className="small muted">Case name
            <input value={name} placeholder={p.defaultName} onChange={e => setName(e.target.value)} autoFocus />
          </label>
          <label className="small muted">Notes
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Your hypothesis, what you noticed…" />
          </label>
          <div className="small muted">Saves: {snapLabel(p.current)}</div>
          <div className="row">
            <button className="primary" onClick={() => { p.onCreate(name.trim() || p.defaultName, notes); setCreating(false); setName(''); setNotes(''); }}>📌 Save case file</button>
            <button onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="primary wide" onClick={() => setCreating(true)}>📌 Open a case file for this</button>
      )}

      <h4 className="mc-h">🗂 Saved cases <span className="muted small">({p.cases.length})</span></h4>
      {p.cases.length === 0 && <p className="muted small">No saved cases yet. Investigate anything, then pin it here. Come back to it any time, on any device.</p>}
      <div className="case-list">
        {p.cases.map(c => (
          <div key={c.id} className={`casefile saved ${p.openCase?.id === c.id ? 'current' : ''}`}>
            <button className="saved-main" onClick={() => p.onOpen(c)}>
              <div className="cf-h">{c.name} {c.tone && <span className={`mini-stamp t-${c.tone}`}>{STAMP[c.tone]}</span>}</div>
              <div className="cf-b">{snapLabel(c.snap)}</div>
              {c.headline && <div className="cf-b"><i>{c.headline}</i></div>}
              <div className="cf-f">{c.trend ? c.trend + ' · ' : ''}updated {ago(c.updatedAt)}</div>
            </button>
            <button className="del" title="Delete case" onClick={() => { if (confirm(`Delete "${c.name}"?`)) p.onDelete(c); }}>🗑</button>
          </div>
        ))}
      </div>

      <h4 className="mc-h">👣 Investigation trail</h4>
      <p className="muted small">Every step is checkpointed automatically. Click one to jump back.</p>
      <ol className="trail">
        {p.trail.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => (
          <li key={i} className={i === p.trailIdx ? 'here' : i > p.trailIdx ? 'future' : ''}>
            <button onClick={() => p.onJump(i)}>
              <span>{snapLabel(e.snap)}</span>
              <span className="muted small">{i === p.trailIdx ? '◀ you are here' : new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
