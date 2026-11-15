import { diverging } from '../lib/colors';
import type { Palette } from '../lib/variables';
import { MONTHS } from '../lib/variables';

export function Stripes({ t, y, palette, unit }: { t: number[]; y: number[]; palette: Palette; unit: string }) {
  // annualise if monthly
  const byYear = new Map<number, number[]>();
  t.forEach((tt, i) => { const k = Math.floor(tt); if (!byYear.has(k)) byYear.set(k, []); byYear.get(k)!.push(y[i]); });
  const rows = [...byYear.entries()].map(([yr, v]) => ({ yr, v: v.reduce((a, b) => a + b, 0) / v.length }));
  const m = rows.reduce((a, b) => a + b.v, 0) / rows.length;
  const s = Math.sqrt(rows.reduce((a, b) => a + (b.v - m) ** 2, 0) / rows.length) || 1;
  return (
    <div>
      <div className="stripes">
        {rows.map(r => (
          <div key={r.yr} className="stripe" style={{ background: diverging(palette, (r.v - m) / (2.2 * s)) }}
            title={`${r.yr}: ${(r.v - m >= 0 ? '+' : '')}${(r.v - m).toFixed(2)} ${unit} vs average`} />
        ))}
      </div>
      <div className="axis-row"><span>{rows[0]?.yr}</span><span>each bar = one year, coloured by how far it was from the long-term average</span><span>{rows[rows.length - 1]?.yr}</span></div>
    </div>
  );
}

export function Heatmap({ grid, palette, unit }: { grid: { year: number; vals: (number | null)[] }[]; palette: Palette; unit: string }) {
  const all = grid.flatMap(g => g.vals.filter((v): v is number => v !== null));
  const s = Math.sqrt(all.reduce((a, b) => a + b * b, 0) / all.length) || 1;
  return (
    <div>
      <div className="heatmap" style={{ gridTemplateColumns: `36px repeat(${grid.length}, 1fr)` }}>
        {MONTHS.map((mn, m) => (
          <div key={mn} style={{ display: 'contents' }}>
            <div className="hm-label">{mn}</div>
            {grid.map(g => {
              const v = g.vals[m];
              return <div key={g.year} className="hm-cell" style={{ background: v === null ? 'transparent' : diverging(palette, v / (2.2 * s)) }}
                title={v === null ? `${mn} ${g.year}: no data` : `${mn} ${g.year}: ${v >= 0 ? '+' : ''}${v.toFixed(2)} ${unit} vs normal ${mn}`} />;
            })}
          </div>
        ))}
      </div>
      <div className="axis-row"><span>{grid[0]?.year}</span><span>each cell = one month, compared with that month's long-term average</span><span>{grid[grid.length - 1]?.year}</span></div>
    </div>
  );
}
