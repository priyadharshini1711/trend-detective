export type Palette = 'temp' | 'wet' | 'sun' | 'wind' | 'cold';

export interface Variable {
  key: string;           // NASA POWER parameter
  label: string;
  unit: string;
  icon: string;
  group: string;
  source: 'MERRA-2' | 'CERES' | 'MERRA-2 / IMERG';
  startYear: number;
  palette: Palette;
  kid: string;           // plain-language definition for students
}

export const VARIABLES: Variable[] = [
  { key: 'T2M', label: 'Air temperature', unit: '°C', icon: '🌡️', group: 'Heat', source: 'MERRA-2', startYear: 1981, palette: 'temp',
    kid: 'How warm the air is about 2 metres above the ground — roughly at head height.' },
  { key: 'T2M_MAX', label: 'Daily high temperature', unit: '°C', icon: '🔥', group: 'Heat', source: 'MERRA-2', startYear: 1981, palette: 'temp',
    kid: 'The hottest point of the day, averaged over the month. Good for spotting heat stress.' },
  { key: 'T2M_MIN', label: 'Night-time low temperature', unit: '°C', icon: '🌙', group: 'Heat', source: 'MERRA-2', startYear: 1981, palette: 'temp',
    kid: 'The coldest point of the day (usually just before sunrise). Nights often warm faster than days!' },
  { key: 'T2M_RANGE', label: 'Day–night temperature gap', unit: '°C', icon: '↕️', group: 'Heat', source: 'MERRA-2', startYear: 1981, palette: 'temp',
    kid: 'Difference between the daily high and low. Clouds and humidity tend to shrink it.' },
  { key: 'TS', label: 'Ground (skin) temperature', unit: '°C', icon: '🪨', group: 'Heat', source: 'MERRA-2', startYear: 1981, palette: 'temp',
    kid: 'Temperature of the very surface of land, ice or sea — what a thermal camera would see.' },
  { key: 'FROST_DAYS', label: 'Frost days', unit: 'days', icon: '❄️', group: 'Cold & snow', source: 'MERRA-2', startYear: 1981, palette: 'cold',
    kid: 'Days when it gets cold enough for frost to form (below 0 °C at the dew point).' },
  { key: 'SNODP', label: 'Snow depth', unit: 'cm', icon: '⛄', group: 'Cold & snow', source: 'MERRA-2', startYear: 1981, palette: 'cold',
    kid: 'How deep the snow lying on the ground is. Tells us about winters and spring melt water.' },
  { key: 'PRECTOTCORR', label: 'Rainfall (precipitation)', unit: 'mm/day', icon: '🌧️', group: 'Water', source: 'MERRA-2 / IMERG', startYear: 1981, palette: 'wet',
    kid: 'All the rain and snow that falls, shown as millimetres per day on average.' },
  { key: 'PRECSNO', label: 'Snowfall', unit: 'mm/day', icon: '🌨️', group: 'Cold & snow', source: 'MERRA-2', startYear: 1981, palette: 'cold',
    kid: 'The part of precipitation that falls as snow (as melted water).' },
  { key: 'GWETROOT', label: 'Root-zone soil wetness', unit: '0–1', icon: '🌱', group: 'Water', source: 'MERRA-2', startYear: 1981, palette: 'wet',
    kid: 'How wet the soil is where plant roots live (top ~1 m). 0 = bone dry, 1 = soaked.' },
  { key: 'GWETTOP', label: 'Surface soil wetness', unit: '0–1', icon: '💧', group: 'Water', source: 'MERRA-2', startYear: 1981, palette: 'wet',
    kid: 'Wetness of the top 5 cm of soil — reacts fast to rain and drying sun.' },
  { key: 'EVPTRNS', label: 'Evapotranspiration', unit: 'W/m²', icon: '🌫️', group: 'Water', source: 'MERRA-2', startYear: 1981, palette: 'wet',
    kid: 'Energy used to turn water into vapour from soil and plant leaves — the land "sweating".' },
  { key: 'RH2M', label: 'Relative humidity', unit: '%', icon: '💦', group: 'Water', source: 'MERRA-2', startYear: 1981, palette: 'wet',
    kid: 'How close the air is to being full of water vapour. 100% = fog or rain likely.' },
  { key: 'QV2M', label: 'Absolute humidity', unit: 'g/kg', icon: '🫧', group: 'Water', source: 'MERRA-2', startYear: 1981, palette: 'wet',
    kid: 'Actual grams of water vapour in each kilogram of air. Warmer air can hold more.' },
  { key: 'CLOUD_AMT', label: 'Cloud cover', unit: '%', icon: '☁️', group: 'Sun & sky', source: 'CERES', startYear: 1984, palette: 'sun',
    kid: 'What share of the sky is covered by cloud, as seen by NASA satellites.' },
  { key: 'ALLSKY_SFC_SW_DWN', label: 'Sunlight reaching the ground', unit: 'kWh/m²/day', icon: '☀️', group: 'Sun & sky', source: 'CERES', startYear: 1984, palette: 'sun',
    kid: 'Solar energy hitting the ground, clouds included. Matters for crops and solar panels.' },
  { key: 'CLRSKY_SFC_SW_DWN', label: 'Clear-sky sunlight', unit: 'kWh/m²/day', icon: '🔆', group: 'Sun & sky', source: 'CERES', startYear: 1984, palette: 'sun',
    kid: 'Sunlight if there were no clouds — changes here point to haze, dust or pollution.' },
  { key: 'WS2M', label: 'Wind speed (2 m)', unit: 'm/s', icon: '🍃', group: 'Wind', source: 'MERRA-2', startYear: 1981, palette: 'wind',
    kid: 'How fast the wind blows near the ground, where people and crops feel it.' },
  { key: 'WS10M', label: 'Wind speed (10 m)', unit: 'm/s', icon: '🌬️', group: 'Wind', source: 'MERRA-2', startYear: 1981, palette: 'wind',
    kid: 'Wind at 10 m — the standard height used by weather stations.' },
  { key: 'PS', label: 'Surface air pressure', unit: 'kPa', icon: '🎈', group: 'Wind', source: 'MERRA-2', startYear: 1981, palette: 'wind',
    kid: 'The weight of the air above you. Low pressure often brings storms.' },
];

export const VAR = Object.fromEntries(VARIABLES.map(v => [v.key, v])) as Record<string, Variable>;

export type Mode = 'annual' | 'anomaly' | 'DJF' | 'MAM' | 'JJA' | 'SON' | `m${number}`;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: 'annual', label: 'Yearly average', hint: 'One number per year — smooth and simple.' },
  { key: 'anomaly', label: 'Every month (seasons removed)', hint: 'Subtracts the normal seasonal cycle so we compare each month with its own average. 12× more data points.' },
  { key: 'DJF', label: 'Dec–Feb', hint: 'Northern winter / southern summer.' },
  { key: 'MAM', label: 'Mar–May', hint: 'Northern spring.' },
  { key: 'JJA', label: 'Jun–Aug', hint: 'Northern summer / monsoon season.' },
  { key: 'SON', label: 'Sep–Nov', hint: 'Northern autumn.' },
  ...MONTHS.map((m, i) => ({ key: `m${i + 1}` as Mode, label: m, hint: `Only ${m} of each year.` })),
];

export const modeLabel = (m: Mode) => MODES.find(x => x.key === m)?.label ?? m;
