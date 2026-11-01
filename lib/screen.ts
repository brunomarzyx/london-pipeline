import fs from "node:fs";
import path from "node:path";
import { getStreetDb } from "./street";

/** Value-vs-momentum screen: neighbourhoods (LSOAs) cheaper per sq m than their borough
 * whose local repeat-sales momentum (MSOA) beats the borough's. All thresholds are named here. */
export const SCREEN_MIN_N = 10; // size-matched sales in the LSOA over 36 months
export const MAX_DISCOUNT = -0.1; // LSOA £/sq m at least 10% below its borough
export const MIN_MOMENTUM_EDGE = 0;
// MSOA repeat-sales pairs needed before its momentum counts. At 60 pairs 1y moves reach ±30% (noise);
// at 150 the largest is 16%, keeping 253 of 1,002 MSOAs.
export const SCREEN_MIN_PAIRS = 150;
// Optional filters. PTAL 3 starts at access index 10.01 (TfL bands); IMD deciles 1-2 = most deprived 20% in England.
export const GOOD_TRANSPORT_MIN_PTAI = 10.01;
export const NOT_DEPRIVED_MIN_DECILE = 3;

export interface ScreenOpts {
  goodTransport?: boolean;
  notDeprived?: boolean;
  /** Keep rows whose buyer-lens Area Risk Score is at most this (rows with no score are dropped). */
  maxAreaScore?: number;
  /** Drop rows whose representative postcode is in Flood Zone 3 (unknown zones are kept). */
  excludeFloodZone3?: boolean;
} // MSOA 1y momentum minus borough 1y momentum, must be > this

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
  ptal?: string | null;
  ptai?: number | null;
  imdDecile?: number | null;
  crimePctile?: number | null;
  /** Buyer-lens Area Risk Score at the row's representative postcode (null when low coverage). */
  areaScoreBuyer?: number | null;
  /** True when the representative postcode is in Flood Zone 3 (null when unknown). */
  floodZone3?: boolean | null;
}

/** Pure: keep rows that pass both tests, rank by momentum edge then depth of discount,
 * and keep one row per MSOA (momentum is measured at MSOA level, so its LSOAs would otherwise repeat). */
export function rankScreen(rows: ScreenRow[], limit = 25, opts: ScreenOpts = {}): ScreenRow[] {
  const passed = rows
    .filter((r) => !opts.goodTransport || (r.ptai ?? -1) >= GOOD_TRANSPORT_MIN_PTAI)
    .filter((r) => !opts.notDeprived || (r.imdDecile ?? 0) >= NOT_DEPRIVED_MIN_DECILE)
    .filter((r) => opts.maxAreaScore == null || (r.areaScoreBuyer != null && r.areaScoreBuyer <= opts.maxAreaScore))
    .filter((r) => !opts.excludeFloodZone3 || r.floodZone3 !== true)
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

// Base rows are fixed for a given street.db, so compute once per server process.
let cache: { rows: ScreenRow[]; asof: string | null } | null = null;

// Precomputed LSOA Area Risk Scores (scripts/build-area-score-lsoa.ts). Joined by
// LSOA in baseRows so the screen stays fast; live-scoring all rows costs ~3s.
let scoreIndex: Record<string, { buyer: number | null; floodZone3: boolean | null }> | null = null;
let scoreIndexMissing = false;

function getScoreIndex(): Record<string, { buyer: number | null; floodZone3: boolean | null }> | null {
  if (scoreIndex || scoreIndexMissing) return scoreIndex;
  try {
    const p = process.env.AREA_SCORE_LSOA_PATH ?? path.join(process.cwd(), "data", "context", "area-score-lsoa.json");
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as {
      rows: Record<string, { buyer: number | null; floodZone3: boolean | null }>;
    };
    scoreIndex = raw.rows;
    return scoreIndex;
  } catch {
    scoreIndexMissing = true;
    return null;
  }
}

function baseRows(): { rows: ScreenRow[]; asof: string | null } | null {
  if (cache) return cache;
  const d = getStreetDb();
  if (!d) return null;
  let hasCtx = true;
  try {
    d.prepare("SELECT 1 FROM lsoa_context LIMIT 1").get();
  } catch {
    hasCtx = false;
  }
  const ctxCols = hasCtx
    ? "c.ptal AS ptal, c.ptai AS ptai, c.imd_decile AS imdDecile, c.crime_pctile AS crimePctile,"
    : "NULL AS ptal, NULL AS ptai, NULL AS imdDecile, NULL AS crimePctile,";
  const ctxJoin = hasCtx ? "LEFT JOIN lsoa_context c ON c.lsoa = l.code" : "";
  const raw = d
    .prepare(
      `WITH pm AS (SELECT DISTINCT lsoa, msoa FROM postcodes WHERE lsoa IS NOT NULL AND msoa IS NOT NULL),
       sec AS (SELECT lsoa, sector FROM (SELECT lsoa, sector, count(*) c,
                 row_number() OVER (PARTITION BY lsoa ORDER BY count(*) DESC) rn FROM sales GROUP BY lsoa, sector) WHERE rn = 1)
       SELECT ${ctxCols} l.code AS lsoa, m.code AS msoa,
              (SELECT s.postcode FROM sales s WHERE s.lsoa = l.code GROUP BY s.postcode ORDER BY count(*) DESC LIMIT 1) AS postcode, l.name AS name, sec.sector AS sector, m.rs_pairs AS pairs, b.name AS borough, l.n_ppsm AS n, l.med_ppsm AS ppsm,
              b.med_ppsm AS boroughPpsm, m.rs_chg_1y AS mom1y, b.rs_chg_1y AS boroughMom1y, m.rs_chg_5y AS mom5y
       FROM area_stats l
       JOIN pm ON pm.lsoa = l.code
       LEFT JOIN sec ON sec.lsoa = l.code
       ${ctxJoin}
       JOIN area_stats m ON m.level = 'msoa' AND m.code = pm.msoa
       JOIN area_stats b ON b.level = 'borough' AND b.code = l.lad
       WHERE l.level = 'lsoa' AND l.med_ppsm IS NOT NULL AND b.med_ppsm IS NOT NULL
         AND m.rs_chg_1y IS NOT NULL AND b.rs_chg_1y IS NOT NULL`,
    )
    .all() as Omit<ScreenRow, "discount" | "edge">[];
  const idx = getScoreIndex();
  const rows = raw.map((r) => ({
    ...r,
    discount: r.ppsm / r.boroughPpsm - 1,
    edge: r.mom1y - r.boroughMom1y,
    areaScoreBuyer: idx?.[r.lsoa]?.buyer ?? null,
    floodZone3: idx?.[r.lsoa]?.floodZone3 ?? null,
  }));
  const asof = (d.prepare("SELECT value FROM meta WHERE key='asof'").get() as { value: string } | undefined)?.value ?? null;
  cache = { rows, asof };
  return cache;
}

export function getValueScreen(
  limit = 25,
  opts: ScreenOpts = {},
): { rows: ScreenRow[]; candidates: number; asof: string | null } {
  const b = baseRows();
  if (!b) return { rows: [], candidates: 0, asof: null };
  return { rows: rankScreen(b.rows, limit, opts), candidates: rankScreen(b.rows, 1e9, opts).length, asof: b.asof };
}
