import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { normalisePostcode } from "../street.js";

export type ContextSignal = {
  key: string;
  label: string;
  available: boolean;
  score: number | null;
  direction: "risk" | "amenity";
  headline: string;
  facts: Record<string, string | number | boolean | null>;
  method: string;
  source: string;
  asof: string;
};

const SOURCE =
  "TfL open data Line/elizabeth StopPoints https://api.tfl.gov.uk/Line/elizabeth/StopPoints + " +
  "HM Land Registry Price Paid sales in data/street.db (indexed postcode/sector queries, see lib/street.ts)";
const METHOD_PROX =
  "Score is the London percentile (0=best, 100=worst) of straight-line distance to the nearest Elizabeth line station in Greater London.";
const METHOD_PREM =
  "Cross-sectional comparison only: median sale price within 1 km of an Elizabeth line station vs borough-wide median, same window (Oct 2023-Sep 2026). " +
  "street.db holds no pre-2022 sales, so no before/after effect can be measured; mix differences are not adjusted.";

let db: Database.Database | null = null;
let dbMissing = false;

function contextPath(): string {
  return (
    process.env.TRANSPORT_CONTEXT_PATH ??
    path.join(process.cwd(), "data", "context", "transport.db")
  );
}

function getDb(): Database.Database | null {
  if (dbMissing) return null;
  if (db) return db;
  const p = contextPath();
  if (!fs.existsSync(p)) {
    dbMissing = true;
    return null;
  }
  try {
    db = new Database(p, { readonly: true });
    return db;
  } catch {
    dbMissing = true;
    return null;
  }
}

/** Test hook: drop the cached connection (e.g. after changing TRANSPORT_CONTEXT_PATH). */
export function resetTransportDb(): void {
  try {
    db?.close();
  } catch {
    /* ignore */
  }
  db = null;
  dbMissing = false;
}

function fmtM(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtP(p: number): string {
  return `£${Math.round(p).toLocaleString("en-GB")}`;
}

/**
 * Elizabeth line effect: [proximity signal, price-premium signal].
 * Premium is informational (score null): the sales window is entirely
 * post-opening, so no causal premium over a pre-opening baseline exists.
 */
export function getTransportSignal(postcode: string): ContextSignal[] {
  const asof = "2026-09-30";
  const pc = normalisePostcode(postcode);
  if (!pc) {
    const u = (key: string, label: string, method: string): ContextSignal => ({
      key, label, available: false, score: null, direction: "amenity",
      headline: `“${postcode}” is not a valid UK postcode.`,
      facts: {}, method, source: SOURCE, asof,
    });
    return [u("transport-proximity", "Elizabeth line proximity", METHOD_PROX),
            u("transport-premium", "Elizabeth line price premium", METHOD_PREM)];
  }
  const d = getDb();
  if (!d) {
    const u = (key: string, label: string, method: string): ContextSignal => ({
      key, label, available: false, score: null, direction: "amenity",
      headline: "Transport data is not available.",
      facts: {}, method, source: SOURCE, asof,
    });
    return [u("transport-proximity", "Elizabeth line proximity", METHOD_PROX),
            u("transport-premium", "Elizabeth line price premium", METHOD_PREM)];
  }
  try {
    const m = d
      .prepare("SELECT station_name, dist_m, score, lad FROM postcode_metrics WHERE postcode=?")
      .get(pc) as
      | { station_name: string; dist_m: number; score: number; lad: string }
      | undefined;
    if (!m) {
      const u = (key: string, label: string, method: string): ContextSignal => ({
        key, label, available: false, score: null, direction: "amenity",
        headline: `No transport data covers postcode ${pc}.`,
        facts: {}, method, source: SOURCE, asof,
      });
      return [u("transport-proximity", "Elizabeth line proximity", METHOD_PROX),
              u("transport-premium", "Elizabeth line price premium", METHOD_PREM)];
    }
    const st = d.prepare("SELECT elizabeth_since FROM stations WHERE name=?").get(m.station_name) as
      | { elizabeth_since: string }
      | undefined;
    const proximity: ContextSignal = {
      key: "transport-proximity",
      label: "Elizabeth line proximity",
      available: true,
      score: m.score,
      direction: "amenity",
      headline:
        `Nearest Elizabeth line station is ${m.station_name} (${fmtM(m.dist_m)} away; ` +
        `Elizabeth line service since ${st?.elizabeth_since ?? "May 2022"}).`,
      facts: {
        postcode: pc,
        nearest_station: m.station_name,
        nearest_station_m: m.dist_m,
        elizabeth_service_since: st?.elizabeth_since ?? null,
      },
      method: METHOD_PROX,
      source: SOURCE,
      asof,
    };
    const prem = d
      .prepare("SELECT near_n, near_median, borough_n, borough_median, premium_pct FROM borough_premium WHERE lad=?")
      .get(m.lad) as
      | { near_n: number; near_median: number | null; borough_n: number; borough_median: number; premium_pct: number | null }
      | undefined;
    let premium: ContextSignal;
    if (prem && prem.premium_pct !== null && prem.near_median !== null) {
      const dir = prem.premium_pct >= 0 ? "above" : "below";
      premium = {
        key: "transport-premium",
        label: "Elizabeth line price premium",
        available: true,
        score: null,
        direction: "amenity",
        headline:
          `Near Elizabeth line stations in this borough, homes sold for a median ${fmtP(prem.near_median)} ` +
          `(${Math.abs(prem.premium_pct)}% ${dir} the borough median of ${fmtP(prem.borough_median)}, ` +
          `${prem.near_n} near-station sales vs ${prem.borough_n} borough sales, Oct 2023-Sep 2026; ` +
          `cross-sectional only, not proof of an Elizabeth line effect).`,
        facts: {
          postcode: pc,
          lad: m.lad,
          near_station_median_price: prem.near_median,
          borough_median_price: prem.borough_median,
          premium_pct: prem.premium_pct,
          near_station_sales_n: prem.near_n,
          borough_sales_n: prem.borough_n,
          sales_window: "2023-10-01 to 2026-09-30",
        },
        method: METHOD_PREM,
        source: SOURCE,
        asof,
      };
    } else {
      premium = {
        key: "transport-premium",
        label: "Elizabeth line price premium",
        available: false,
        score: null,
        direction: "amenity",
        headline: `Too few near-station sales in this borough to estimate a premium (${prem?.near_n ?? 0} sales).`,
        facts: { postcode: pc, lad: m.lad, near_station_sales_n: prem?.near_n ?? 0 },
        method: METHOD_PREM,
        source: SOURCE,
        asof,
      };
    }
    return [proximity, premium];
  } catch {
    return [
      {
        key: "transport-proximity", label: "Elizabeth line proximity",
        available: false, score: null, direction: "amenity",
        headline: "Transport data is not available.", facts: {},
        method: METHOD_PROX, source: SOURCE, asof,
      },
    ];
  }
}
