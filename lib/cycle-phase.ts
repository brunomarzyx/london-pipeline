// Pure, client-safe cycle-phase classifier. No node imports here — the
// dashboard map layer (a client component) imports from this module.
export const PRICE_GROWTH_PCT = 0;
export const PRESSURE_HIGH = 1.0;
export const PRESSURE_LOW = 0.25;

export type CyclePhase =
  | "recovery"
  | "expansion"
  | "hypersupply"
  | "recession"
  | "unknown";

export const PHASE_LABEL: Record<CyclePhase, string> = {
  recovery: "Recovery",
  expansion: "Expansion",
  hypersupply: "Hypersupply",
  recession: "Recession",
  unknown: "No data",
};

export const PHASE_COLOR: Record<CyclePhase, string> = {
  recovery: "#22c55e",
  expansion: "#3b82f6",
  hypersupply: "#f59e0b",
  recession: "#ef4444",
  unknown: "#d4d4d8",
};

export function classifyCycle(
  priceChange: number | null,
  pressure: number | null,
  _momentum: number | null = null,
): CyclePhase {
  if (priceChange == null || pressure == null) return "unknown";
  if (pressure >= PRESSURE_HIGH) return "hypersupply";
  if (priceChange < PRICE_GROWTH_PCT) return "recession";
  if (pressure < PRESSURE_LOW) return "recovery";
  return "expansion";
}

/** £447,950 — never a bare 447950. */
export function fmtPrice(v: number | null): string {
  if (v == null) return "no data";
  return `£${Math.round(v).toLocaleString("en-GB")}`;
}

/** −13.3% with a true minus sign and one decimal; null → "no data". */
export function fmtPct(v: number | null, digits = 1): string {
  if (v == null) return "no data";
  return `${v.toFixed(digits).replace("-", "−")}%`;
}

/** 1,070 homes; null → "no data". */
export function fmtHomes(v: number | null): string {
  if (v == null) return "no data";
  return `${Math.round(v).toLocaleString("en-GB")} homes`;
}

/** −0.93× with two decimals; null → "no data". */
export function fmtPressure(v: number | null): string {
  if (v == null) return "no data";
  return `${v.toFixed(2).replace("-", "−")}×`;
}
