import fs from "node:fs";
import path from "node:path";
import { normalisePostcode, getStreetDb } from "../street";
import type { ContextSignal } from "./epc";

type Agg = { n: number; gt90: number; pct: number };

let cache: {
  asof: string;
  source: string;
  lsoa: Record<string, Agg>;
  totals: { listings: number; entire_home: number; entire_gt90: number };
} | null = null;
let cacheMissing = false;

function shortletsDataPath(): string {
  return (
    process.env.SHORTLETS_DATA_PATH ??
    path.join(process.cwd(), "data", "context", "shortlets.json")
  );
}

function loadData(): typeof cache {
  if (cacheMissing) return null;
  if (cache) return cache;
  const p = shortletsDataPath();
  if (!fs.existsSync(p)) {
    cacheMissing = true;
    return null;
  }
  try {
    cache = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    cacheMissing = true;
    return null;
  }
  return cache;
}

/** Test hook: clear cached data (e.g. after changing SHORTLETS_DATA_PATH). */
export function resetShortletsData(): void {
  cache = null;
  cacheMissing = false;
}

/**
 * Short-let pressure: entire-home Airbnb listings in the postcode's LSOA 2021
 * (assigned by nearest postcode centroid), scored as the London percentile of
 * the entire-home count across LSOAs (100 = worst). Flags listings available
 * >90 nights/year against London's 90-night rule.
 */
export function getShortletsSignal(postcode: string): ContextSignal {
  const unavailable = (headline: string): ContextSignal => ({
    key: "shortlets",
    label: "Short-let pressure",
    available: false,
    score: null,
    direction: "risk",
    headline,
    facts: {},
    method: "Score is the London percentile of the entire-home listing count across LSOAs.",
    source: "Inside Airbnb London listings",
    asof: loadData()?.asof ?? "unknown",
  });
  const pc = normalisePostcode(postcode);
  if (!pc) return unavailable(`"${postcode}" is not a valid postcode.`);
  const d = getStreetDb();
  if (!d) return unavailable(`No postcode data available for ${pc}.`);
  let lsoa: string | undefined;
  try {
    const r = d.prepare("SELECT lsoa FROM postcodes WHERE postcode=?").get(pc) as
      | { lsoa: string }
      | undefined;
    lsoa = r?.lsoa || undefined;
  } catch {
    lsoa = undefined;
  }
  if (!lsoa) return unavailable(`${pc} is outside the London area covered.`);
  const data = loadData();
  if (!data) return unavailable(`No short-let data available for ${pc}.`);
  const agg = data.lsoa[lsoa];
  if (!agg) return unavailable(`No short-let data available for ${pc}.`);
  const share90 = agg.n > 0 ? Math.round((agg.gt90 / agg.n) * 100) : 0;
  return {
    key: "shortlets",
    label: "Short-let pressure",
    available: true,
    score: agg.pct,
    direction: "risk",
    headline:
      agg.n === 0
        ? `No entire-home short lets found in the LSOA containing ${pc} — among the lowest short-let pressure in London.`
        : `${agg.n} entire-home short lets in the LSOA containing ${pc} (${share90}% available >90 nights/year); short-let pressure is higher than in ${Math.round(agg.pct)}% of London LSOAs.`,
    facts: {
      postcode: pc,
      lsoa,
      n_entire_home: agg.n,
      n_avail_gt90: agg.gt90,
      pct_entire_home_london: agg.pct,
      rule_nights: 90,
    },
    method:
      "Score is the London percentile of the entire-home listing count across all London LSOAs (100 = worst).",
    source: data.source,
    asof: data.asof,
  };
}
