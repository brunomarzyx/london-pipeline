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

/** Gross rental yield in percent: 12 × avg monthly rent ÷ avg price × 100. */
export function grossYield(
  avgRentMonthly: number | null,
  avgPrice: number | null,
): number | null {
  if (avgRentMonthly == null || avgPrice == null || avgPrice === 0)
    return null;
  return ((12 * avgRentMonthly) / avgPrice) * 100;
}

/** Price-to-rent multiple: avg price ÷ annualised rent. */
export function priceToRent(
  avgPrice: number | null,
  avgRentMonthly: number | null,
): number | null {
  if (avgPrice == null || avgRentMonthly == null || avgRentMonthly === 0)
    return null;
  return avgPrice / (12 * avgRentMonthly);
}

/** Rent change in percent over 12 months; null when unknown or base is 0. */
export function rentChange12m(
  latest: number | null,
  twelveMonthsAgo: number | null,
): number | null {
  if (latest == null || twelveMonthsAgo == null || twelveMonthsAgo === 0)
    return null;
  return ((latest - twelveMonthsAgo) / twelveMonthsAgo) * 100;
}

/** Sales volume change as a fraction (latest 12m vs prior 12m); null when unknown or prior is 0. */
export function salesVolumeChange12m(
  latest: number | null,
  prior: number | null,
): number | null {
  if (latest == null || prior == null || prior === 0) return null;
  return latest / prior - 1;
}

/** New-build share of sales as a fraction; null when unknown or there were no sales. */
export function newBuildShare(
  newBuildSales: number | null,
  totalSales: number | null,
): number | null {
  if (newBuildSales == null || totalSales == null || totalSales === 0)
    return null;
  return newBuildSales / totalSales;
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
