// Global housing-cycle metrics from BIS city series (data/global.json).
// Pure functions are client-safe; only loadGlobalDoc() touches the filesystem
// (server: /api/global, Ask tool). City series are nominal; real values are
// derived by deflating with national CPI. Never interpolate: missing is null.

export const GLOBAL_REAL_UP = 0;
export const GLOBAL_STEPS_1Y_M = 12;
export const GLOBAL_STEPS_5Y_M = 60;
export const GLOBAL_STEPS_10Y_M = 120;
export const GLOBAL_STEPS_1Y_Q = 4;
export const GLOBAL_STEPS_5Y_Q = 20;
export const GLOBAL_STEPS_10Y_Q = 40;

export type GlobalPhase =
  | "expansion"
  | "cooling"
  | "correction"
  | "recovery"
  | "unknown";

export const GLOBAL_PHASE_LABEL: Record<GlobalPhase, string> = {
  expansion: "Expansion",
  cooling: "Cooling",
  correction: "Correction",
  recovery: "Recovery",
  unknown: "No data",
};

/** Real-price momentum × rate direction. Nulls → unknown. */
export function classifyGlobalPhase(
  real1y: number | null,
  rateChange12m: number | null,
): GlobalPhase {
  if (real1y == null || rateChange12m == null) return "unknown";
  const up = real1y > GLOBAL_REAL_UP;
  const easing = rateChange12m <= 0;
  if (up && easing) return "expansion";
  if (up && !easing) return "cooling";
  if (!up && easing) return "recovery";
  return "correction";
}

export type Freq = "M" | "Q";

export function quarterEndMonth(q: number): number {
  return q * 3;
}

/** "2026-08" → 2026*12+8; "2026-Q2" → month index of quarter-end. */
export function periodToMonthIndex(p: string): number {
  const m = p.match(/^(\d{4})-(\d{2})$/);
  if (m) return Number(m[1]) * 12 + Number(m[2]);
  const q = p.match(/^(\d{4})-Q([1-4])$/);
  if (q) return Number(q[1]) * 12 + quarterEndMonth(Number(q[2]));
  throw new Error(`bad period: ${p}`);
}

function monthIndexToPeriod(idx: number, freq: Freq): string {
  const y = Math.floor((idx - 1) / 12);
  const m = ((idx - 1) % 12) + 1;
  if (freq === "M") return `${y}-${String(m).padStart(2, "0")}`;
  return `${y}-Q${Math.ceil(m / 3)}`;
}

/** Exact period n steps back; null only when out of range (never). */
export function stepBackPeriod(latest: string, n: number, freq: Freq): string {
  const step = freq === "M" ? n : n * 3;
  return monthIndexToPeriod(periodToMonthIndex(latest) - step, freq);
}

/** Quarter-end month "YYYY-MM" for CPI alignment. */
export function cpiMonthFor(period: string): string {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (m) return period;
  const q = period.match(/^(\d{4})-Q([1-4])$/);
  if (q)
    return `${q[1]}-${String(quarterEndMonth(Number(q[2]))).padStart(2, "0")}`;
  throw new Error(`bad period: ${period}`);
}

export interface Obs {
  p: string;
  v: number;
}

/** Deflate nominal city prices with national CPI → real index (same units). */
export function toReal(price: Obs[], cpi: Map<string, number>): Obs[] {
  const out: Obs[] = [];
  for (const o of price) {
    const c = cpi.get(cpiMonthFor(o.p));
    if (c != null && c !== 0) out.push({ p: o.p, v: (o.v / c) * 100 });
  }
  return out;
}

/** % change vs the observation exactly n steps back; null when absent. */
export function changeOver(real: Obs[], latest: string, n: number, freq: Freq): number | null {
  const byP = new Map(real.map((o) => [o.p, o.v]));
  const now = byP.get(latest);
  const then = byP.get(stepBackPeriod(latest, n, freq));
  if (now == null || then == null || then === 0) return null;
  return ((now - then) / Math.abs(then)) * 100;
}

/** % distance below the max over the trailing window (inclusive). */
export function distFromPeak(real: Obs[], latest: string, window: number): number | null {
  const latestIdx = periodToMonthIndex(latest);
  const sorted = real
    .filter((o) => periodToMonthIndex(o.p) <= latestIdx)
    .sort((a, b) => (a.p < b.p ? -1 : 1));
  const tail = sorted.slice(-window);
  if (!tail.length) return null;
  const now = tail[tail.length - 1].v;
  const peak = Math.max(...tail.map((o) => o.v));
  if (peak === 0) return null;
  return ((now - peak) / peak) * 100;
}

/** Latest month-end policy rate and its 12-month change (pp). */
export function policyStats(
  policy: Obs[],
): { latest: string | null; rate: number | null; change12m: number | null } {
  if (!policy.length) return { latest: null, rate: null, change12m: null };
  const sorted = [...policy].sort((a, b) => (a.p < b.p ? -1 : 1));
  const last = sorted[sorted.length - 1];
  const byP = new Map(sorted.map((o) => [o.p, o.v]));
  const [y, m] = last.p.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 12);
  const ago = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const then = byP.get(ago);
  return {
    latest: last.p,
    rate: last.v,
    change12m: then == null ? null : last.v - then,
  };
}

export interface GlobalCityDoc {
  key: string;
  city: string;
  country: string;
  country_code: string;
  rate_code: string;
  series: string;
  freq: Freq;
  unit: string;
  nominal: boolean;
  price: [string, number][];
  cpi: [string, number][];
  policy: [string, number][];
}

export interface CityMetrics {
  key: string;
  city: string;
  country: string;
  latestPeriod: string;
  freq: Freq;
  nominal: boolean;
  bisSeries: string;
  real1y: number | null;
  real5y: number | null;
  distFromPeak: number | null;
  policyRate: number | null;
  policyMonth: string | null;
  policyChange12m: number | null;
  phase: GlobalPhase;
  spark: Obs[];
}

export function cityMetrics(doc: GlobalCityDoc): CityMetrics {
  const price: Obs[] = doc.price.map(([p, v]) => ({ p, v }));
  const real = toReal(price, new Map(doc.cpi));
  const latest = price.length ? price[price.length - 1].p : "";
  const steps1y = doc.freq === "M" ? GLOBAL_STEPS_1Y_M : GLOBAL_STEPS_1Y_Q;
  const steps5y = doc.freq === "M" ? GLOBAL_STEPS_5Y_M : GLOBAL_STEPS_5Y_Q;
  const steps10y = doc.freq === "M" ? GLOBAL_STEPS_10Y_M : GLOBAL_STEPS_10Y_Q;
  const real1y = latest ? changeOver(real, latest, steps1y, doc.freq) : null;
  const real5y = latest ? changeOver(real, latest, steps5y, doc.freq) : null;
  const peakGap =
    latest && real.length >= steps1y ? distFromPeak(real, latest, steps10y) : null;
  const pol = policyStats(doc.policy.map(([p, v]) => ({ p, v })));
  return {
    key: doc.key,
    city: doc.city,
    country: doc.country,
    latestPeriod: latest,
    freq: doc.freq,
    nominal: doc.nominal,
    bisSeries: doc.series,
    real1y,
    real5y,
    distFromPeak: peakGap,
    policyRate: pol.rate,
    policyMonth: pol.latest,
    policyChange12m: pol.change12m,
    phase: classifyGlobalPhase(real1y, pol.change12m),
    spark: real.slice(-40),
  };
}

export function findCityDoc(
  cities: GlobalCityDoc[],
  key: string,
): GlobalCityDoc | null {
  return (
    cities.find(
      (c) =>
        c.key === key.toLowerCase() || c.city.toLowerCase() === key.toLowerCase(),
    ) ?? null
  );
}
