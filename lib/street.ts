import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type CompType = "flat" | "house";

export interface LadderRow {
  level: string;
  code: string;
  name: string;
  n: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
}

export interface CompSale {
  address: string;
  date: string;
  price: number;
  postcode: string;
  lat: number | null;
  lon: number | null;
  floor_area?: number | null;
  ppsm?: number | null;
  epc_rating?: string | null;
}

/** £ per sq m view: price per floor area from Land Registry sales matched to EPC certificates. */
export interface PpsmView {
  level: string;
  name: string;
  n: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  /** Only when a floor area was given: p25/median/p75 £/sq m x sqm, rounded to £1,000. */
  fairRange: { sqm: number; low: number; mid: number; high: number } | null;
}

/** Neighbourhood (LSOA) context: deprivation, transport access and recorded crime. */
export interface AreaContext {
  lsoa: string;
  imdRank: number | null; // 1 = most deprived of 33,755 in England (IoD 2025)
  imdDecile: number | null; // 1 = most deprived 10%
  ptal: string | null; // TfL band 0-6b (2015)
  ptai: number | null;
  ptalImputed: boolean; // LSOA code changed 2011->2021: MSOA average used
  crime12m: number | null;
  burglary12m: number | null;
  violence12m: number | null;
  crimePctile: number | null; // within London LSOAs, 100 = most recorded crime
  crimeWindow: string | null;
}

/** Null when the context table has not been built (feature hides itself). */
export function getAreaContext(lsoa: string): AreaContext | null {
  const d = getStreetDb();
  if (!d) return null;
  try {
    const r = d.prepare("SELECT * FROM lsoa_context WHERE lsoa=?").get(lsoa) as
      | { imd_rank: number | null; imd_decile: number | null; ptal: string | null; ptai: number | null; ptal_imputed: number;
          crime_12m: number | null; burglary_12m: number | null; violence_12m: number | null; crime_pctile: number | null }
      | undefined;
    if (!r) return null;
    const w = d.prepare("SELECT value FROM meta WHERE key='crime_window'").get() as { value: string } | undefined;
    return {
      lsoa, imdRank: r.imd_rank, imdDecile: r.imd_decile, ptal: r.ptal, ptai: r.ptai, ptalImputed: r.ptal_imputed === 1,
      crime12m: r.crime_12m, burglary12m: r.burglary_12m, violence12m: r.violence_12m, crimePctile: r.crime_pctile,
      crimeWindow: w?.value ?? null,
    };
  } catch {
    return null; // table absent (e.g. older street.db or test fixture)
  }
}

export interface AreaComps {
  postcode: string;
  type: CompType | null;
  chosenLevel: string;
  chosenCode: string;
  chosenName: string;
  chosenN: number;
  chosenMedian: number | null;
  chosenP25: number | null;
  chosenP75: number | null;
  ladder: LadderRow[];
  momentum: { chg1y: number | null; chg5y: number | null; from: string | null };
  comps: CompSale[];
  asof: string;
  source: string;
  ppsm: PpsmView | null;
  context: AreaContext | null;
}

let db: Database.Database | null = null;
let dbMissing = false;

export function streetDbPath(): string {
  return (
    process.env.STREET_DB_PATH ?? path.join(process.cwd(), "data", "street.db")
  );
}

/** Null when street.db is absent — the feature hides itself gracefully. */
export function getStreetDb(): Database.Database | null {
  if (dbMissing) return null;
  if (db) return db;
  const p = streetDbPath();
  if (!fs.existsSync(p)) {
    dbMissing = true;
    return null;
  }
  db = new Database(p, { readonly: true });
  return db;
}

/** Test hook: reset cached connection (e.g. after changing STREET_DB_PATH). */
export function resetStreetDb(): void {
  try {
    db?.close();
  } catch {
    /* already closed */
  }
  db = null;
  dbMissing = false;
}

const OUT_RE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/;

/** "se155ab" → "SE15 5AB"; null when invalid. */
export function normalisePostcode(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length < 5 || compact.length > 7) return null;
  const outward = compact.slice(0, -3);
  const inward = compact.slice(-3);
  const m = `${outward} ${inward}`.match(OUT_RE);
  if (!m) return null;
  // Inward code must be digit + 2 letters; outward must start with letter(s)+digit.
  if (!/^[A-Z]{1,2}\d[A-Z\d]?$/.test(outward)) return null;
  if (!/^\d[A-Z]{2}$/.test(inward)) return null;
  return `${outward} ${inward}`;
}

interface AreaRow {
  level: string;
  code: string;
  name: string;
  n_36m: number;
  med_36m: number | null;
  p25_36m: number | null;
  p75_36m: number | null;
  n_flat: number;
  med_flat: number | null;
  n_house: number;
  med_house: number | null;
  p25_flat: number | null;
  p75_flat: number | null;
  p25_house: number | null;
  p75_house: number | null;
  n_ppsm_flat: number | null;
  med_ppsm_flat: number | null;
  p25_ppsm_flat: number | null;
  p75_ppsm_flat: number | null;
  n_ppsm_house: number | null;
  med_ppsm_house: number | null;
  p25_ppsm_house: number | null;
  p75_ppsm_house: number | null;
  n_ppsm: number | null;
  med_ppsm: number | null;
  rs_chg_1y: number | null;
  rs_chg_5y: number | null;
}

interface PcRow {
  postcode: string;
  sector: string;
  lsoa: string;
  msoa: string;
  lad: string;
  street_key: string;
}

function nFor(r: AreaRow, type: CompType | null): number {
  if (type === "flat") return r.n_flat ?? 0;
  if (type === "house") return r.n_house ?? 0;
  return r.n_36m ?? 0;
}

function medFor(r: AreaRow, type: CompType | null): number | null {
  if (type === "flat") return r.med_flat;
  if (type === "house") return r.med_house;
  return r.med_36m;
}

/** Quartiles for the same type as the median, so p25 <= median <= p75 always holds. */
function qFor(r: AreaRow, type: CompType | null): [number | null, number | null] {
  if (type === "flat") return [r.p25_flat, r.p75_flat];
  if (type === "house") return [r.p25_house, r.p75_house];
  return [r.p25_36m, r.p75_36m];
}

/** £/sq m stats for a type; untyped falls back to all-types n and median (no quartiles stored). */
function ppsmFor(r: AreaRow, type: CompType | null): { n: number; med: number | null; p25: number | null; p75: number | null } {
  if (type === "flat") return { n: r.n_ppsm_flat ?? 0, med: r.med_ppsm_flat, p25: r.p25_ppsm_flat, p75: r.p75_ppsm_flat };
  if (type === "house") return { n: r.n_ppsm_house ?? 0, med: r.med_ppsm_house, p25: r.p25_ppsm_house, p75: r.p75_ppsm_house };
  return { n: r.n_ppsm ?? 0, med: r.med_ppsm, p25: null, p75: null };
}

const round1k = (x: number) => Math.round(x / 1000) * 1000;

/** Pure: fair range for a floor area from £/sq m quartiles. Null unless all three are known and sqm is plausible. */
export function fairRange(
  sqm: number | null | undefined,
  q: { p25: number | null; med: number | null; p75: number | null },
): { sqm: number; low: number; mid: number; high: number } | null {
  if (sqm == null || !Number.isFinite(sqm) || sqm < 15 || sqm > 1000) return null;
  if (q.p25 == null || q.med == null || q.p75 == null) return null;
  return { sqm, low: round1k(q.p25 * sqm), mid: round1k(q.med * sqm), high: round1k(q.p75 * sqm) };
}

function minN(d: Database.Database): number {
  const row = d
    .prepare("SELECT value FROM meta WHERE key='min_n'")
    .get() as { value: string } | undefined;
  return row ? Number(row.value) : 10;
}

/**
 * Walk street → sector → lsoa → msoa → borough, picking the FIRST level
 * with n ≥ meta.min_n for the requested type (n_flat/n_house when a type is
 * given, else n_36m). Every query uses an index (postcodes(postcode),
 * area_stats(level,code), sales(street_key|sector|postcode)).
 */
export function getAreaComps(
  postcode: string,
  type?: CompType | null,
  sqm?: number | null,
): AreaComps | { error: "invalid" } | { error: "not_found" } {
  const pc = normalisePostcode(postcode);
  if (!pc) return { error: "invalid" };
  const d = getStreetDb();
  if (!d) return { error: "not_found" };
  const prow = d.prepare("SELECT * FROM postcodes WHERE postcode=?").get(pc) as
    | PcRow
    | undefined;
  if (!prow) return { error: "not_found" };

  const t: CompType | null = type === "flat" || type === "house" ? type : null;
  const minNVal = minN(d);
  const meta = (k: string): string =>
    (d.prepare("SELECT value FROM meta WHERE key=?").get(k) as { value: string })
      .value;
  const asof = meta("asof");
  const source = meta("source");

  const levels: { level: string; code: string }[] = [
    { level: "street", code: prow.street_key },
    { level: "sector", code: prow.sector },
    { level: "lsoa", code: prow.lsoa },
    { level: "msoa", code: prow.msoa },
    { level: "borough", code: prow.lad },
  ];
  const stmt = d.prepare("SELECT * FROM area_stats WHERE level=? AND code=?");
  const rows = levels.map(({ level, code }) => ({
    level,
    row: stmt.get(level, code) as AreaRow | undefined,
  }));

  const ladder: LadderRow[] = rows.map(({ level, row }) => ({
    level,
    code: level === "street" ? prow.street_key : (row?.code ?? ""),
    name: row?.name ?? level,
    n: row ? nFor(row, t) : 0,
    median: row ? medFor(row, t) : null,
    p25: row ? qFor(row, t)[0] : null,
    p75: row ? qFor(row, t)[1] : null,
  }));

  let chosenIdx = rows.findIndex(({ row }) => row && nFor(row, t) >= minNVal);
  if (chosenIdx === -1) chosenIdx = rows.length - 1;
  const chosen = rows[chosenIdx].row!;
  const chosenMedian = medFor(chosen, t);

  // Momentum: msoa rs index else borough (rs only computed where pairs ≥ 60).
  const msoa = rows.find((r) => r.level === "msoa")?.row;
  const borough = rows.find((r) => r.level === "borough")?.row;
  const momentum =
    msoa?.rs_chg_1y != null
      ? { chg1y: msoa.rs_chg_1y, chg5y: msoa.rs_chg_5y, from: "MSOA" }
      : {
          chg1y: borough?.rs_chg_1y ?? null,
          chg5y: borough?.rs_chg_5y ?? null,
          from: borough?.rs_chg_1y != null ? "borough" : null,
        };

  // Up to 12 most recent comparable sales at the chosen level (same type if given).
  const chosenLevel = rows[chosenIdx].level;
  const typeFilter = t === "flat" ? "AND type='F'" : t === "house" ? "AND type<>'F'" : "";
  let comps: CompSale[] = [];
  if (chosenLevel === "street") {
    comps = d
      .prepare(
        `SELECT address, date, price, postcode, lat, lon, floor_area, ppsm, epc_rating FROM sales WHERE street_key=? ${typeFilter} ORDER BY date DESC LIMIT 12`,
      )
      .all(prow.street_key) as CompSale[];
  } else {
    // sector and above: the postcode's sector sales (indexed); the level's
    // p25/med/p75 already summarise the wider area.
    comps = d
      .prepare(
        `SELECT address, date, price, postcode, lat, lon, floor_area, ppsm, epc_rating FROM sales WHERE sector=? ${typeFilter} ORDER BY date DESC LIMIT 12`,
      )
      .all(prow.sector) as CompSale[];
  }

  // £/sq m: finest level with enough EPC-matched sales of this type (same ladder rule, its own n).
  let ppsm: PpsmView | null = null;
  const pIdx = rows.findIndex(({ row }) => row && ppsmFor(row, t).n >= minNVal);
  if (pIdx !== -1) {
    const pr = rows[pIdx].row!;
    const q = ppsmFor(pr, t);
    ppsm = { level: rows[pIdx].level, name: pr.name, n: q.n, median: q.med, p25: q.p25, p75: q.p75, fairRange: fairRange(sqm, q) };
  }

  return {
    postcode: pc,
    type: t,
    chosenLevel,
    chosenCode: chosen.code,
    chosenName: chosen.name,
    chosenN: nFor(chosen, t),
    chosenMedian,
    chosenP25: qFor(chosen, t)[0],
    chosenP75: qFor(chosen, t)[1],
    ladder,
    momentum,
    comps,
    asof,
    source,
    ppsm,
    context: getAreaContext(prow.lsoa),
  };
}

/**
 * Percentile of an asking price within comparable sales of that type.
 * Pure: comps are prices at the chosen level (query sales by street_key or
 * sector index; for lsoa/msoa/borough the sector fallback already applies).
 * Returns % of comps strictly below the price (0–100), null when empty.
 */
export function pricePercentile(price: number, comps: number[]): number | null {
  if (!comps.length || !Number.isFinite(price)) return null;
  const below = comps.filter((c) => c < price).length;
  return Math.round((below / comps.length) * 100);
}

/** Streets with reliable=1 in a borough, for the borough-page Leaflet layer. */
export function getStreetsInBorough(lad: string): {
  code: string;
  name: string;
  med: number | null;
  n: number;
  lat: number | null;
  lon: number | null;
}[] {
  const d = getStreetDb();
  if (!d) return [];
  return d
    .prepare(
      "SELECT code, name, med_36m AS med, n_36m AS n, lat, lon FROM area_stats WHERE level='street' AND lad=? AND reliable=1",
    )
    .all(lad) as {
    code: string;
    name: string;
    med: number | null;
    n: number;
    lat: number | null;
    lon: number | null;
  }[];
}
