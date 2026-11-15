// Trend Detective statistics engine (browser).
// Mirrors backend/app/engine.py so results can be cross-checked ("Verify with Python").

// ---------- special functions ----------
function lgamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-300, EPS = 3e-14;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value of Student's t. */
export function tPValue(t: number, df: number): number {
  if (!isFinite(t)) return 0;
  return ibeta(df / (df + t * t), df / 2, 0.5);
}

/** Quantile of Student's t (q in (0.5,1)). */
export function tQuantile(q: number, df: number): number {
  const target = 2 * (1 - q);
  let lo = 0, hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tPValue(mid, df) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26 refined with a series for small |x|
  const s = Math.sign(x); x = Math.abs(x);
  if (x < 0.5) {
    let sum = x, term = x;
    for (let n = 1; n < 30; n++) { term *= (-x * x) / n; sum += term / (2 * n + 1); }
    return s * (2 / Math.sqrt(Math.PI)) * sum;
  }
  // continued fraction for erfc
  let f = 0;
  for (let n = 60; n >= 1; n--) f = (n / 2) / (x + f);
  const erfc = Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f);
  return s * (1 - erfc);
}
export const normCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));
export function normQuantile(q: number): number {
  let lo = -10, hi = 10;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (normCdf(m) < q) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---------- helpers ----------
export const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
export function sd(a: number[]): number {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}
export function lag1(a: number[]): number {
  const m = mean(a);
  let num = 0, den = 0;
  for (let i = 0; i < a.length; i++) {
    den += (a[i] - m) ** 2;
    if (i > 0) num += (a[i] - m) * (a[i - 1] - m);
  }
  return den === 0 ? 0 : num / den;
}
function median(sorted: number[]): number {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

// ---------- tests ----------
export interface OLSResult {
  slope: number; intercept: number; se: number; t: number; p: number;
  ciLow: number; ciHigh: number; df: number; r2: number;
  r1: number; nEff: number; resid: number[];
}

export function ols(t: number[], y: number[], alpha = 0.05, ar1Correct = true): OLSResult {
  const n = t.length;
  const tm = mean(t), ym = mean(y);
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxx += (t[i] - tm) ** 2; sxy += (t[i] - tm) * (y[i] - ym); syy += (y[i] - ym) ** 2; }
  const slope = sxy / sxx;
  const intercept = ym - slope * tm;
  const resid = y.map((v, i) => v - (intercept + slope * t[i]));
  const sse = resid.reduce((s, v) => s + v * v, 0);
  const r1 = lag1(resid);
  // Santer et al. (2000) effective sample size for AR(1) residuals
  let nEff = n;
  if (ar1Correct && r1 > 0) nEff = Math.max(3.01, (n * (1 - r1)) / (1 + r1));
  const df = Math.max(1, nEff - 2);
  const se = Math.sqrt(sse / df / sxx);
  const tt = slope / se;
  const p = tPValue(tt, df);
  const tq = tQuantile(1 - alpha / 2, df);
  return { slope, intercept, se, t: tt, p, ciLow: slope - tq * se, ciHigh: slope + tq * se, df,
    r2: syy === 0 ? 0 : 1 - sse / syy, r1, nEff, resid };
}

export interface MKResult {
  S: number; varS: number; z: number; p: number; tau: number;
  senSlope: number; senIntercept: number; senLow: number; senHigh: number; correction: number;
}

export function mannKendall(t: number[], y: number[], alpha = 0.05, ar1Correct = true): MKResult {
  const n = y.length;
  let S = 0;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      S += Math.sign(y[j] - y[i]);
      if (t[j] !== t[i]) slopes.push((y[j] - y[i]) / (t[j] - t[i]));
    }
  }
  // ties correction
  const counts = new Map<number, number>();
  y.forEach(v => counts.set(v, (counts.get(v) ?? 0) + 1));
  let tieSum = 0;
  counts.forEach(c => { if (c > 1) tieSum += c * (c - 1) * (2 * c + 5); });
  let varS = (n * (n - 1) * (2 * n + 5) - tieSum) / 18;

  slopes.sort((a, b) => a - b);
  const senSlope = median(slopes);
  const senIntercept = median([...y.map((v, i) => v - senSlope * t[i])].sort((a, b) => a - b));

  // Yue & Wang (2004): variance inflation from lag-1 autocorrelation of the Sen-detrended series
  let correction = 1;
  if (ar1Correct) {
    const det = y.map((v, i) => v - senSlope * t[i]);
    const r1 = lag1(det);
    if (r1 > 0) {
      let s = 0;
      for (let k = 1; k < n; k++) s += (1 - k / n) * Math.pow(r1, k);
      correction = 1 + 2 * s;
    }
  }
  varS *= correction;

  const z = S > 0 ? (S - 1) / Math.sqrt(varS) : S < 0 ? (S + 1) / Math.sqrt(varS) : 0;
  const p = 2 * (1 - normCdf(Math.abs(z)));
  // Gilbert (1987) confidence interval for Sen's slope
  const N = slopes.length;
  const C = normQuantile(1 - alpha / 2) * Math.sqrt(varS);
  const m1 = Math.max(1, Math.min(N, Math.round((N - C) / 2)));
  const m2 = Math.max(1, Math.min(N, Math.round((N + C) / 2) + 1));
  return { S, varS, z, p, tau: S / (0.5 * n * (n - 1)), senSlope, senIntercept,
    senLow: slopes[m1 - 1], senHigh: slopes[m2 - 1], correction };
}

export interface PettittResult { index: number; time: number; K: number; p: number; meanBefore: number; meanAfter: number }

export function pettitt(t: number[], y: number[]): PettittResult {
  const n = y.length;
  let best = 0, bestIdx = 0, U = 0;
  // U_k = U_{k-1} + sum_j sign(x_k - x_j)
  for (let k = 0; k < n - 1; k++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += Math.sign(y[k] - y[j]);
    U += s;
    if (Math.abs(U) > best) { best = Math.abs(U); bestIdx = k; }
  }
  const p = Math.min(1, 2 * Math.exp((-6 * best * best) / (n ** 3 + n ** 2)));
  return { index: bestIdx, time: t[bestIdx], K: best, p,
    meanBefore: mean(y.slice(0, bestIdx + 1)), meanAfter: mean(y.slice(bestIdx + 1)) };
}

export interface DetectResult { nStar: number; low: number; high: number; yearsMore: number; phi: number; sigma: number }

/** Weatherhead et al. (1998), generalised to m samples/year: years of data needed to detect the
 *  current trend with ~90% probability at the 5% level. */
export function yearsToDetect(slope: number, resid: number[], pointsPerYear: number, nYears: number): DetectResult {
  const phi = Math.min(0.95, Math.max(0, lag1(resid)));
  const sigma = sd(resid);
  const ar = Math.sqrt((1 + phi) / (1 - phi));
  const nStar = slope === 0 ? Infinity :
    Math.pow(((3.3 * sigma * Math.sqrt(12 / pointsPerYear)) / Math.abs(slope)) * ar, 2 / 3);
  const B = (4 / (3 * Math.sqrt(Math.max(nStar, 1)))) * ar;
  return { nStar, low: nStar * Math.exp(-B), high: nStar * Math.exp(B),
    yearsMore: Math.max(0, nStar - nYears), phi, sigma };
}

export interface FullResult {
  n: number; nYears: number; startYear: number; endYear: number; pointsPerYear: number;
  ols: OLSResult; mk: MKResult; pettitt: PettittResult; detect: DetectResult;
  significant: boolean; agree: boolean; direction: 'up' | 'down' | 'flat';
}

export function analyze(t: number[], y: number[], pointsPerYear: number, alpha = 0.05, ar1Correct = true): FullResult {
  const o = ols(t, y, alpha, ar1Correct);
  const mk = mannKendall(t, y, alpha, ar1Correct);
  const pt = pettitt(t, y);
  const startYear = Math.floor(t[0]), endYear = Math.floor(t[t.length - 1]);
  const nYears = endYear - startYear + 1;
  const det = yearsToDetect(o.slope, o.resid, pointsPerYear, nYears);
  const sigO = o.p < alpha, sigM = mk.p < alpha;
  return { n: t.length, nYears, startYear, endYear, pointsPerYear, ols: o, mk, pettitt: pt, detect: det,
    significant: sigO && sigM, agree: sigO === sigM,
    direction: !(sigO || sigM) ? 'flat' : (mk.senSlope > 0 ? 'up' : 'down') };
}
