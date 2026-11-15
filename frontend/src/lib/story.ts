import type { FullResult } from './stats';
import { VAR, modeLabel, type Mode } from './variables';

export interface Place { name: string; lat: number; lon: number }

export const PLACE_TYPES: { key: string; label: string; icon: string; examples: Place[]; suggest: string[] }[] = [
  { key: 'polar', label: 'Icy & polar', icon: '🧊', examples: [{ name: 'Svalbard, Norway', lat: 78.22, lon: 15.65 }, { name: 'Utqiaġvik, Alaska', lat: 71.29, lon: -156.79 }], suggest: ['T2M', 'SNODP', 'FROST_DAYS', 'T2M_MIN'] },
  { key: 'desert', label: 'Dry & desert', icon: '🏜️', examples: [{ name: 'Niamey, Niger (Sahel)', lat: 13.51, lon: 2.11 }, { name: 'Phoenix, USA', lat: 33.45, lon: -112.07 }], suggest: ['PRECTOTCORR', 'GWETROOT', 'T2M_MAX', 'RH2M'] },
  { key: 'tropical', label: 'Rainforest', icon: '🌴', examples: [{ name: 'Manaus, Brazil', lat: -3.12, lon: -60.02 }, { name: 'Borneo, Indonesia', lat: 0.5, lon: 114.0 }], suggest: ['PRECTOTCORR', 'EVPTRNS', 'T2M_MAX', 'CLOUD_AMT'] },
  { key: 'farm', label: 'Farmland', icon: '🌾', examples: [{ name: 'Iowa, USA', lat: 42.03, lon: -93.47 }, { name: 'Punjab, India', lat: 30.9, lon: 75.85 }], suggest: ['GWETROOT', 'PRECTOTCORR', 'T2M_MAX', 'ALLSKY_SFC_SW_DWN'] },
  { key: 'city', label: 'Big city', icon: '🏙️', examples: [{ name: 'Bengaluru, India', lat: 12.97, lon: 77.59 }, { name: 'Delhi, India', lat: 28.61, lon: 77.21 }], suggest: ['T2M_MIN', 'T2M_MAX', 'CLRSKY_SFC_SW_DWN', 'RH2M'] },
  { key: 'coast', label: 'Coast & islands', icon: '🏖️', examples: [{ name: 'Chennai, India', lat: 13.08, lon: 80.27 }, { name: 'Miami, USA', lat: 25.76, lon: -80.19 }], suggest: ['QV2M', 'T2M', 'WS10M', 'PRECTOTCORR'] },
  { key: 'mountain', label: 'Mountains', icon: '🏔️', examples: [{ name: 'Tibetan Plateau', lat: 32.0, lon: 90.0 }, { name: 'Swiss Alps', lat: 46.5, lon: 8.0 }], suggest: ['SNODP', 'T2M', 'FROST_DAYS', 'PRECSNO'] },
];

export const CURIOSITIES: { key: string; label: string; icon: string; vars: string[] }[] = [
  { key: 'hot', label: 'Is it getting hotter?', icon: '🔥', vars: ['T2M', 'T2M_MAX', 'T2M_MIN', 'T2M_RANGE'] },
  { key: 'rain', label: 'Rain, floods & drought', icon: '🌧️', vars: ['PRECTOTCORR', 'GWETROOT', 'GWETTOP', 'EVPTRNS'] },
  { key: 'snow', label: 'Snow, ice & frost', icon: '❄️', vars: ['SNODP', 'FROST_DAYS', 'PRECSNO', 'T2M_MIN'] },
  { key: 'sky', label: 'Sunshine & clouds', icon: '☀️', vars: ['ALLSKY_SFC_SW_DWN', 'CLOUD_AMT', 'CLRSKY_SFC_SW_DWN'] },
  { key: 'air', label: 'Humid, sticky air', icon: '💦', vars: ['RH2M', 'QV2M', 'T2M'] },
  { key: 'wind', label: 'Wind & storms', icon: '🌬️', vars: ['WS10M', 'WS2M', 'PS'] },
];

export function fmtSlope(perYear: number, unit: string, digits = 2): string {
  const perDecade = perYear * 10;
  const a = Math.abs(perDecade);
  const d = a >= 10 ? 1 : a >= 1 ? digits : a >= 0.01 ? 3 : 4;
  return `${perDecade >= 0 ? '+' : '−'}${a.toFixed(d)} ${unit}/decade`;
}

export function fmtP(p: number): string {
  if (p < 0.001) return 'p < 0.001';
  return `p = ${p.toFixed(3)}`;
}

/** Plain-language verdict for students. */
export function verdict(r: FullResult, varKey: string, mode: Mode, place: string): { headline: string; body: string; tone: 'up' | 'down' | 'flat' | 'mixed' } {
  const v = VAR[varKey];
  const what = `${modeLabel(mode).toLowerCase()} ${v.label.toLowerCase()}`;
  const sen = r.mk.senSlope;
  const total = sen * (r.endYear - r.startYear);
  const change = `${total >= 0 ? 'risen' : 'fallen'} by about ${Math.abs(total).toPrecision(2)} ${v.unit}`;
  if (r.significant) {
    const strength = Math.max(r.ols.p, r.mk.p) < 0.001 ? 'overwhelming' : Math.max(r.ols.p, r.mk.p) < 0.01 ? 'strong' : 'solid';
    return {
      tone: r.direction === 'up' ? 'up' : 'down',
      headline: `Case closed: ${v.label.toLowerCase()} is ${sen > 0 ? 'rising' : 'falling'}.`,
      body: `Since ${r.startYear}, ${what} in ${place} has ${change} (${fmtSlope(sen, v.unit)}). Both of our detectives — the straight-line test and the Mann-Kendall rank test — agree, and the evidence is ${strength}. A wiggle this steady is very unlikely to be just chance.`,
    };
  }
  if (!r.agree) {
    return {
      tone: 'mixed',
      headline: 'Suspicious, but the detectives disagree.',
      body: `One test thinks ${what} in ${place} is ${sen > 0 ? 'rising' : 'falling'}, the other isn't convinced. That usually means a few extreme years are doing the talking. Treat it as a lead, not a conviction — and check the change-point clue below.`,
    };
  }
  const yrs = r.detect.yearsMore;
  const when = isFinite(yrs) && yrs < 300
    ? ` If the current drift (${fmtSlope(sen, v.unit)}) carries on, we'd expect enough evidence in roughly ${Math.ceil(yrs)} more years — around ${r.endYear + Math.ceil(yrs)}.`
    : ' There is essentially no drift at all — the ups and downs look like natural variability.';
  return {
    tone: 'flat',
    headline: 'Not enough evidence… yet.',
    body: `Over ${r.nYears} years, ${what} in ${place} has bounced around without a clear direction that stands out from its natural year-to-year noise.${when}`,
  };
}

export interface CaseStep { say: string; lat?: number; lon?: number; place?: string; param?: string; mode?: Mode; region?: { span: number; n: number } | null; tab?: 'chart' | 'stripes' | 'heatmap' }
export interface CaseFile { id: string; title: string; tagline: string; icon: string; steps: CaseStep[] }

export const CASE_FILES: CaseFile[] = [
  {
    id: 'arctic', title: 'The Melting North', icon: '🧊', tagline: 'The Arctic is warming faster than anywhere else. Can we prove it?',
    steps: [
      { say: 'Our first suspect: Svalbard, a group of islands halfway between Norway and the North Pole.', lat: 78.22, lon: 15.65, place: 'Svalbard, Norway', param: 'T2M', mode: 'annual', region: null, tab: 'chart' },
      { say: 'Each dot is one year of NASA MERRA-2 air temperature. The red line is the best straight-line fit; the dashed line is the outlier-proof Sen slope.', tab: 'chart' },
      { say: 'Climate stripes: every bar is a year, blue for cooler than normal, red for warmer. Do the recent years (right side) look different from the early ones?', tab: 'stripes' },
      { say: 'Is it every season? The heat-map shows every month of every year — which months have changed most?', tab: 'heatmap' },
      { say: 'Zooming out: a 5×5 grid of Arctic locations, each with its own trend test. Solid squares passed the trend test; faded ones did not.', region: { span: 16, n: 5 }, tab: 'chart' },
    ],
  },
  {
    id: 'sahel', title: 'Sahel: Return of the Rains?', icon: '🌧️', tagline: 'After the great droughts of the 1970s–80s, did the rain come back?',
    steps: [
      { say: 'Niamey, Niger, sits in the Sahel — the strip between the Sahara and the savanna. Here the rainy season is June to August.', lat: 13.51, lon: 2.11, place: 'Niamey, Niger (Sahel)', param: 'PRECTOTCORR', mode: 'JJA', region: null, tab: 'chart' },
      { say: 'Look for the change-point clue: the Pettitt test finds the year where the average shifted most.', tab: 'chart' },
      { say: 'Soil tells the same story? Root-zone wetness is what crops actually feel.', param: 'GWETROOT', tab: 'chart' },
      { say: 'Across the region: does the rainy season change the same way everywhere? Compare west and east.', param: 'PRECTOTCORR', region: { span: 14, n: 5 }, tab: 'chart' },
    ],
  },
  {
    id: 'split', title: 'Rising Here, Falling There', icon: '🗺️', tagline: 'The same variable can trend in opposite directions just a few hundred km apart.',
    steps: [
      { say: 'Europe, summer soil moisture. Start in Madrid, Spain.', lat: 40.42, lon: -3.7, place: 'Madrid, Spain', param: 'GWETROOT', mode: 'JJA', region: null, tab: 'chart' },
      { say: 'Now a regional grid from the Mediterranean to Scandinavia. Brown = drying, teal = wetting. Faded squares are not significant yet.', lat: 50.0, lon: 10.0, place: 'Central Europe', region: { span: 28, n: 6 }, tab: 'chart' },
      { say: 'Do north and south agree? If not, that is exactly why one global number never tells the whole story.', tab: 'chart' },
    ],
  },
  {
    id: 'patience', title: 'The Patient Detective', icon: '⏳', tagline: 'Some trends are real but hidden in noise. How long until we can tell?',
    steps: [
      { say: 'Wind near Chennai, on India’s east coast. Wind is noisy — lots of year-to-year jumps.', lat: 13.08, lon: 80.27, place: 'Chennai, India', param: 'WS10M', mode: 'annual', region: null, tab: 'chart' },
      { say: 'If the verdict says “not yet”, check the Years-Until-Significant meter. It uses Weatherhead et al. (1998): noise level + memory + trend size → years of data needed.', tab: 'chart' },
      { say: 'Switch to monthly data with the seasons removed: 12× more points, but neighbouring months are correlated, so the app corrects for that “memory”.', mode: 'anomaly', tab: 'chart' },
    ],
  },
  {
    id: 'city', title: 'Hot Nights in the City', icon: '🌙', tagline: 'Are nights warming faster than days in Bengaluru?',
    steps: [
      { say: 'Bengaluru, India. First: daytime highs.', lat: 12.97, lon: 77.59, place: 'Bengaluru, India', param: 'T2M_MAX', mode: 'annual', region: null, tab: 'chart' },
      { say: 'Now night-time lows. Compare the slope per decade with the daytime one.', param: 'T2M_MIN', tab: 'chart' },
      { say: 'Before the monsoon (March–May) is when heat hits hardest.', mode: 'MAM', tab: 'stripes' },
    ],
  },
];
