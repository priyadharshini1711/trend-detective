import { useState } from 'react';
import type { FullResult } from '../lib/stats';
import { fmtP, fmtSlope } from '../lib/story';

const yes = (p: number) => p < 0.05;

export function EvidenceCards({ r, unit, ar1 }: { r: FullResult; unit: string; ar1: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const cards = [
    {
      id: 'ols', title: 'Detective #1 · Straight line (OLS)', pass: yes(r.ols.p),
      main: fmtSlope(r.ols.slope, unit),
      sub: `95% CI ${fmtSlope(r.ols.ciLow, unit).replace('/decade', '')} … ${fmtSlope(r.ols.ciHigh, unit)} · ${fmtP(r.ols.p)} · t = ${r.ols.t.toFixed(2)}`,
      more: `Ordinary least squares fits the best straight line through the data. The confidence interval (CI) is the range the true slope probably lies in; if it doesn't include zero, the trend is significant. ${ar1 ? `Neighbouring values were correlated (lag-1 r = ${r.ols.r1.toFixed(2)}), so we counted only ${r.ols.nEff.toFixed(1)} "effectively independent" points instead of ${r.n} (Santer et al. 2000). ` : ''}R² = ${r.ols.r2.toFixed(2)} — the share of the wiggles explained by the line.`,
    },
    {
      id: 'mk', title: 'Detective #2 · Rank test (Mann-Kendall)', pass: yes(r.mk.p),
      main: fmtSlope(r.mk.senSlope, unit),
      sub: `Sen slope 95% CI ${fmtSlope(r.mk.senLow, unit).replace('/decade', '')} … ${fmtSlope(r.mk.senHigh, unit)} · ${fmtP(r.mk.p)} · τ = ${r.mk.tau.toFixed(2)}`,
      more: `Mann-Kendall doesn't care about the size of values, only whether later values tend to be bigger or smaller than earlier ones — so one crazy year can't fool it. Sen's slope is the median of the slopes between every pair of points (${(r.n * (r.n - 1) / 2).toLocaleString()} pairs!). ${ar1 && r.mk.correction > 1 ? `Variance inflated ×${r.mk.correction.toFixed(2)} for autocorrelation (Yue & Wang 2004).` : ''}`,
    },
    {
      id: 'pt', title: 'Clue · Sudden shift (Pettitt)', pass: yes(r.pettitt.p),
      main: r.pettitt.p < 0.05 ? `Shift around ${Math.floor(r.pettitt.time)}` : 'No clear jump',
      sub: `mean before ${r.pettitt.meanBefore.toPrecision(3)} → after ${r.pettitt.meanAfter.toPrecision(3)} ${unit} · ${fmtP(r.pettitt.p)}`,
      more: 'Not every change is a smooth ramp. The Pettitt test looks for the single point in time where the average jumped the most. A strong shift + a significant trend can mean the "trend" is really a step change (e.g. a climate regime shift).',
    },
  ];
  return (
    <div className="cards">
      {cards.map(c => (
        <button key={c.id} className={`card ${c.pass ? 'pass' : 'fail'}`} onClick={() => setOpen(open === c.id ? null : c.id)}>
          <div className="card-title"><span className={`dot ${c.pass ? 'on' : ''}`} />{c.title}</div>
          <div className="card-main mono">{c.main}</div>
          <div className="card-sub mono">{c.sub}</div>
          {open === c.id ? <div className="card-more">{c.more}</div> : <div className="card-hint">tap to explain ▾</div>}
        </button>
      ))}
    </div>
  );
}

export function DetectMeter({ r }: { r: FullResult }) {
  const d = r.detect;
  const total = d.nStar;
  const have = r.nYears;
  const inf = !isFinite(total) || total > 300;
  const pct = inf ? 3 : Math.min(100, (have / total) * 100);
  const detected = r.significant;
  return (
    <div className="meter">
      <div className="meter-head">
        <span>⏳ Years-until-significant <small>(Weatherhead et al. 1998)</small></span>
        <b className="mono">
          {detected ? 'Detected ✓' : inf ? '∞ — no drift' : d.yearsMore < 0.5 ? 'any year now' : `≈ ${Math.ceil(d.yearsMore)} more yrs`}
        </b>
      </div>
      <div className="meter-bar">
        <div className="meter-fill" style={{ width: `${pct}%` }} />
        {!inf && <div className="meter-range" style={{ left: `${Math.min(100, (have / d.high) * 100)}%`, width: `${Math.max(0, Math.min(100, (have / d.low) * 100) - Math.min(100, (have / d.high) * 100))}%` }} />}
      </div>
      <div className="meter-foot mono">
        <span>{have} yrs of NASA data</span>
        <span>{inf ? '' : `need ≈ ${total.toFixed(0)} yrs (range ${d.low.toFixed(0)}–${d.high.toFixed(0)}) · noise σ=${d.sigma.toPrecision(2)} · memory φ=${d.phi.toFixed(2)}`}</span>
      </div>
      <p className="meter-note">
        {detected
          ? `This trend is already strong enough to see. Weatherhead's formula says ~${total.toFixed(0)} years of data were needed — we have ${have}.`
          : inf ? 'The data show essentially zero drift, so no amount of extra data would turn it into a trend.'
            : `A trend this size hides in noise this loud. With ~90% probability it will become statistically detectable after about ${total.toFixed(0)} years of records — around ${r.startYear + Math.ceil(total)} — if it keeps going.`}
      </p>
    </div>
  );
}
