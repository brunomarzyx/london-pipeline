// Pure SPEC metrics. Missing inputs stay null — never invented.

/** Price change in percent over 12 months; null when unknown or base is 0. */
export function priceChange12m(
  latest: number | null,
  twelveMonthsAgo: number | null,
): number | null {
  if (latest == null || twelveMonthsAgo == null || twelveMonthsAgo === 0)
    return null;
  return ((latest - twelveMonthsAgo) / twelveMonthsAgo) * 100;
}

/** Net pipeline build-up = starts minus completions over the 3-year window. */
export function netPipelineBuildup(
  startsTotal: number | null,
  completionsTotal: number | null,
): number | null {
  if (startsTotal == null || completionsTotal == null) return null;
  return startsTotal - completionsTotal;
}

/** Supply pressure ratio; null (never Infinity) when completions are 0. */
export function supplyPressureRatio(
  netBuildup: number | null,
  avgAnnualCompletions: number | null,
): number | null {
  if (netBuildup == null || avgAnnualCompletions == null) return null;
  if (avgAnnualCompletions === 0) return null;
  return netBuildup / avgAnnualCompletions;
}

/** Below this many prior-4Q starts, a % change is noise (e.g. 30 → 1,530 = +5,000%). */
export const MIN_MOMENTUM_BASE = 100;

/** Starts momentum = latest 4Q starts / prior 4Q starts − 1; null when the prior base is under MIN_MOMENTUM_BASE units. */
export function startsMomentum(
  latest4q: number | null,
  prior4q: number | null,
): number | null {
  if (latest4q == null || prior4q == null || prior4q < MIN_MOMENTUM_BASE)
    return null;
  return latest4q / prior4q - 1;
}
