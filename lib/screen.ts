import { getStreetDb } from "./street";

/** Value-vs-momentum screen: neighbourhoods (LSOAs) cheaper per sq m than their borough
 * whose local repeat-sales momentum (MSOA) beats the borough's. All thresholds are named here. */
export const SCREEN_MIN_N = 10; // size-matched sales in the LSOA over 36 months
export const MAX_DISCOUNT = -0.1; // LSOA £/sq m at least 10% below its borough
export const MIN_MOMENTUM_EDGE = 0;
// MSOA repeat-sales pairs needed before its momentum counts. At 60 pairs 1y moves reach ±30% (noise);
// at 150 the largest is 16%, keeping 253 of 1,002 MSOAs.
export const SCREEN_MIN_PAIRS = 150; // MSOA 1y momentum minus borough 1y momentum, must be > this

export interface ScreenRow {
  lsoa: string;
  name: string;
  msoa: string;
  /** Qualifying LSOAs in this MSOA (rows are one per MSOA, showing the cheapest). */
  hits?: number;
  postcode: string | null; // busiest postcode, links to its street-level comps
  sector: string | null; // most common postcode sector, so the row is findable
  pairs: number;
  borough: string;
  n: number;
  ppsm: number;
  boroughPpsm: number;
  discount: number; // ppsm / boroughPpsm - 1 (negative = cheaper)
  mom1y: number; // MSOA repeat-sales 1y
  boroughMom1y: number;
  edge: number; // mom1y - boroughMom1y
  mom5y: number | null;
}

/** Pure: keep rows that pass both tests, rank by momentum edge then depth of discount,
 * and keep one row per MSOA (momentum is measured at MSOA level, so its LSOAs would otherwise repeat). */
export function rankScreen(rows: ScreenRow[], limit = 25): ScreenRow[] {
  const passed = rows
    .filter((r) => r.n >= SCREEN_MIN_N && r.pairs >= SCREEN_MIN_PAIRS && r.discount <= MAX_DISCOUNT && r.edge > MIN_MOMENTUM_EDGE)
    .sort((a, b) => b.edge - a.edge || a.discount - b.discount);
  const byMsoa = new Map<string, ScreenRow>();
  for (const r of passed) {
    const kept = byMsoa.get(r.msoa);
    if (kept) kept.hits = (kept.hits ?? 1) + 1;
    else byMsoa.set(r.msoa, { ...r, hits: 1 });
  }
  return [...byMsoa.values()].slice(0, limit);
}

export function getValueScreen(limit = 25): { rows: ScreenRow[]; candidates: number; asof: string | null } {
  const d = getStreetDb();
  if (!d) return { rows: [], candidates: 0, asof: null };
  const raw = d
    .prepare(
      `WITH pm AS (SELECT DISTINCT lsoa, msoa FROM postcodes WHERE lsoa IS NOT NULL AND msoa IS NOT NULL),
       sec AS (SELECT lsoa, sector FROM (SELECT lsoa, sector, count(*) c,
                 row_number() OVER (PARTITION BY lsoa ORDER BY count(*) DESC) rn FROM sales GROUP BY lsoa, sector) WHERE rn = 1)
       SELECT l.code AS lsoa, m.code AS msoa,
              (SELECT s.postcode FROM sales s WHERE s.lsoa = l.code GROUP BY s.postcode ORDER BY count(*) DESC LIMIT 1) AS postcode, l.name AS name, sec.sector AS sector, m.rs_pairs AS pairs, b.name AS borough, l.n_ppsm AS n, l.med_ppsm AS ppsm,
              b.med_ppsm AS boroughPpsm, m.rs_chg_1y AS mom1y, b.rs_chg_1y AS boroughMom1y, m.rs_chg_5y AS mom5y
       FROM area_stats l
       JOIN pm ON pm.lsoa = l.code
       LEFT JOIN sec ON sec.lsoa = l.code
       JOIN area_stats m ON m.level = 'msoa' AND m.code = pm.msoa
       JOIN area_stats b ON b.level = 'borough' AND b.code = l.lad
       WHERE l.level = 'lsoa' AND l.med_ppsm IS NOT NULL AND b.med_ppsm IS NOT NULL
         AND m.rs_chg_1y IS NOT NULL AND b.rs_chg_1y IS NOT NULL`,
    )
    .all() as Omit<ScreenRow, "discount" | "edge">[];
  const rows = raw.map((r) => ({
    ...r,
    discount: r.ppsm / r.boroughPpsm - 1,
    edge: r.mom1y - r.boroughMom1y,
  }));
  const asof = (d.prepare("SELECT value FROM meta WHERE key='asof'").get() as { value: string } | undefined)?.value ?? null;
  const ranked = rankScreen(rows, limit);
  return { rows: ranked, candidates: rankScreen(rows, 1e9).length, asof };
}
