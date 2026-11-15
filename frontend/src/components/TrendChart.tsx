import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import type { FullResult } from '../lib/stats';

interface Props { t: number[]; y: number[]; r: FullResult; unit: string; anomaly: boolean }

export default function TrendChart({ t, y, r, unit, anomaly }: Props) {
  const t0 = t[0], t1 = t[t.length - 1];
  const pts = t.map((tt, i) => ({ t: tt, y: y[i] }));
  // smoothed 5-yr (or 5-point x ppy) running mean for readability
  const w = anomaly ? 60 : 5;
  const smooth = t.map((tt, i) => {
    const a = Math.max(0, i - Math.floor(w / 2)), b = Math.min(y.length, i + Math.ceil(w / 2));
    const s = y.slice(a, b);
    return { t: tt, s: s.reduce((p, c) => p + c, 0) / s.length };
  });
  const line = (slope: number, icpt: number) => [{ t: t0, v: icpt + slope * t0 }, { t: t1, v: icpt + slope * t1 }];
  const olsLine = line(r.ols.slope, r.ols.intercept).map(d => ({ t: d.t, ols: d.v }));
  const senLine = line(r.mk.senSlope, r.mk.senIntercept).map(d => ({ t: d.t, sen: d.v }));
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart margin={{ top: 24, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="t" type="number" domain={[Math.floor(t0), Math.ceil(t1)]} tickCount={10}
            tick={{ fill: '#8b93a7', fontSize: 12 }} tickFormatter={v => String(Math.round(v))} allowDuplicatedCategory={false} />
          <YAxis type="number" domain={['auto', 'auto']} tick={{ fill: '#8b93a7', fontSize: 12 }} tickFormatter={fmt} width={56}
            label={{ value: anomaly ? `anomaly (${unit})` : unit, angle: -90, position: 'insideLeft', fill: '#8b93a7', fontSize: 12 }} />
          <Tooltip contentStyle={{ background: '#11151f', border: '1px solid #2a3142', borderRadius: 8 }}
            labelFormatter={v => (anomaly ? `${Math.floor(+v)}-${String(Math.floor((+v % 1) * 12) + 1).padStart(2, '0')}` : String(v))}
            formatter={(v: any, n: any) => [`${fmt(+v)} ${unit}`, n]} />
          <Legend wrapperStyle={{ fontSize: 12, color: '#8b93a7' }} />
          {anomaly && <ReferenceLine y={0} stroke="#3a4256" />}
          <Scatter name="NASA data" data={pts} dataKey="y" fill="#7fb4ff" fillOpacity={anomaly ? 0.35 : 0.85} shape={anomaly ? 'circle' : 'circle'} isAnimationActive={false} />
          <Line name={anomaly ? '5-yr running mean' : '5-yr running mean'} data={smooth} dataKey="s" stroke="#c9d1e3" strokeOpacity={0.5} dot={false} strokeWidth={1.5} isAnimationActive={false} />
          <Line name="Straight-line trend (OLS)" data={olsLine} dataKey="ols" stroke="#ff5a4e" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Line name="Sen slope (outlier-proof)" data={senLine} dataKey="sen" stroke="#ffc24b" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          {r.pettitt.p < 0.05 && <ReferenceLine x={r.pettitt.time + (anomaly ? 0 : 0.5)} stroke="#b48cff" strokeDasharray="3 3"
            label={{ value: `shift ≈ ${Math.floor(r.pettitt.time)}`, fill: '#b48cff', fontSize: 11, position: 'top' }} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
