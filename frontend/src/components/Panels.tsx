import { useState } from 'react';
import { CASE_FILES, CURIOSITIES, PLACE_TYPES, type CaseFile, type Place } from '../lib/story';
import { MODES, VAR, VARIABLES, type Mode } from '../lib/variables';

export function Wizard({ onApply }: { onApply: (p: Place | null, param: string) => void }) {
  const [place, setPlace] = useState<string | null>(null);
  const [cur, setCur] = useState<string | null>(null);
  const pt = PLACE_TYPES.find(p => p.key === place);
  const cu = CURIOSITIES.find(c => c.key === cur);
  const suggestions = cu && pt ? [...new Set([...cu.vars.filter(v => pt.suggest.includes(v)), ...cu.vars, ...pt.suggest])].slice(0, 4)
    : cu ? cu.vars : pt ? pt.suggest : [];
  return (
    <div className="wizard">
      <div className="step"><span className="step-n">1</span> What kind of place?</div>
      <div className="chips">
        {PLACE_TYPES.map(p => (
          <button key={p.key} className={`chip ${place === p.key ? 'sel' : ''}`} onClick={() => setPlace(p.key)}>{p.icon} {p.label}</button>
        ))}
      </div>
      {pt && <div className="examples">Try: {pt.examples.map(e => (
        <button key={e.name} className="link" onClick={() => onApply(e, suggestions[0] ?? 'T2M')}>📍 {e.name}</button>
      ))} <span className="muted">or click anywhere on the map</span></div>}
      <div className="step"><span className="step-n">2</span> What are you curious about?</div>
      <div className="chips">
        {CURIOSITIES.map(c => (
          <button key={c.key} className={`chip ${cur === c.key ? 'sel' : ''}`} onClick={() => setCur(c.key)}>{c.icon} {c.label}</button>
        ))}
      </div>
      {suggestions.length > 0 && <>
        <div className="step"><span className="step-n">3</span> Pick a clue to investigate</div>
        <div className="suggest">
          {suggestions.map(k => (
            <button key={k} className="sugg" onClick={() => onApply(null, k)}>
              <div className="sugg-h">{VAR[k].icon} {VAR[k].label} <span className="tag">{VAR[k].source}</span></div>
              <div className="sugg-b">{VAR[k].kid}</div>
            </button>
          ))}
        </div>
      </>}
    </div>
  );
}

export function Controls({ param, mode, ar1, onParam, onMode, onAr1, lat, lon, onLatLon }: {
  param: string; mode: Mode; ar1: boolean; lat: number; lon: number;
  onParam: (k: string) => void; onMode: (m: Mode) => void; onAr1: (b: boolean) => void; onLatLon: (a: number, b: number) => void;
}) {
  const groups = [...new Set(VARIABLES.map(v => v.group))];
  return (
    <div className="controls">
      <label>Variable
        <select value={param} onChange={e => onParam(e.target.value)}>
          {groups.map(g => <optgroup key={g} label={g}>{VARIABLES.filter(v => v.group === g).map(v => <option key={v.key} value={v.key}>{v.icon} {v.label} ({v.unit})</option>)}</optgroup>)}
        </select>
      </label>
      <p className="muted small">{VAR[param].kid} <i>Source: NASA POWER · {VAR[param].source} · from {VAR[param].startYear}</i></p>
      <label>Time slice
        <select value={mode} onChange={e => onMode(e.target.value as Mode)}>
          <optgroup label="Whole year">{MODES.slice(0, 2).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>
          <optgroup label="Season">{MODES.slice(2, 6).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>
          <optgroup label="Single month">{MODES.slice(6).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>
        </select>
      </label>
      <p className="muted small">{MODES.find(m => m.key === mode)?.hint}</p>
      <label className="toggle"><input type="checkbox" checked={ar1} onChange={e => onAr1(e.target.checked)} /> Correct for autocorrelation ("memory")</label>
      <p className="muted small">This year's value often looks like last year's. Ignoring that makes trends look more certain than they are.</p>
      <div className="latlon">
        <label>Lat <input type="number" step="0.1" value={lat} onChange={e => onLatLon(+e.target.value, lon)} /></label>
        <label>Lon <input type="number" step="0.1" value={lon} onChange={e => onLatLon(lat, +e.target.value)} /></label>
      </div>
    </div>
  );
}

export function CaseFiles({ active, step, onStart, onStep, onStop, playing, onPlay }: {
  active: CaseFile | null; step: number; playing: boolean;
  onStart: (c: CaseFile) => void; onStep: (i: number) => void; onStop: () => void; onPlay: (b: boolean) => void;
}) {
  if (active) {
    const s = active.steps[step];
    return (
      <div className="casefile open">
        <div className="stamp">CASE FILE</div>
        <h3>{active.icon} {active.title}</h3>
        <div className="progress">{active.steps.map((_, i) => <span key={i} className={i <= step ? 'on' : ''} onClick={() => onStep(i)} />)}</div>
        <p className="narration">{s.say}</p>
        <div className="row">
          <button disabled={step === 0} onClick={() => onStep(step - 1)}>◀ Back</button>
          <button onClick={() => onPlay(!playing)}>{playing ? '⏸ Pause' : '▶ Auto-play'}</button>
          {step < active.steps.length - 1 ? <button className="primary" onClick={() => onStep(step + 1)}>Next clue ▶</button>
            : <button className="primary" onClick={onStop}>Close case ✓</button>}
        </div>
        <button className="link small" onClick={onStop}>exit case file</button>
      </div>
    );
  }
  return (
    <div className="case-list">
      {CASE_FILES.map(c => (
        <button key={c.id} className="casefile" onClick={() => onStart(c)}>
          <div className="cf-h">{c.icon} {c.title}</div>
          <div className="cf-b">{c.tagline}</div>
          <div className="cf-f">{c.steps.length} clues · ▶ play</div>
        </button>
      ))}
    </div>
  );
}
