import type { Palette } from './variables';

// Diverging ramps: [negative end, neutral, positive end]
const RAMPS: Record<Palette, [string, string, string]> = {
  temp: ['#2b6cd4', '#f2efe9', '#d4372b'],
  cold: ['#d4372b', '#f2efe9', '#2b6cd4'], // more snow/frost = blue
  wet: ['#a8611f', '#f2efe9', '#178f8a'],
  sun: ['#5b6478', '#f2efe9', '#e0a314'],
  wind: ['#7a4fc2', '#f2efe9', '#2a9d5c'],
};

function hex(c: string) { return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); }
function mix(a: string, b: string, t: number) {
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}

/** value in [-1, 1] → color */
export function diverging(p: Palette, x: number): string {
  const [lo, mid, hi] = RAMPS[p];
  const c = Math.max(-1, Math.min(1, x));
  return c < 0 ? mix(mid, lo, -c) : mix(mid, hi, c);
}

export const rampStops = (p: Palette) => RAMPS[p];
