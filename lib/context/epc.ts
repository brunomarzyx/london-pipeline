import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { normalisePostcode, getStreetDb } from "../street";

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

type Agg = { n: number; dg: number; eg: number; fg: number; med: string; pct: number };

let cache: {
  asof: string;
  source: string;
  min_n: number;
  levels: Record<string, Record<string, Agg>>;
} | null = null;
let cacheMissing = false;

function epcDataPath(): string {
  return (
    process.env.EPC_DATA_PATH ?? path.join(process.cwd(), "data", "context", "epc.json")
  );
}

function loadData(): typeof cache {
  if (cacheMissing) return null;
  if (cache) return cache;
  const p = epcDataPath();
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

/** Test hook: clear cached data (e.g. after changing EPC_DATA_PATH). */
export function resetEpcData(): void {
  cache = null;
  cacheMissing = false;
}

const LADDER = ["street", "sector", "lsoa", "msoa"] as const;

function areaCode(
  d: Database.Database,
  level: (typeof LADDER)[number],
  pc: string,
): string | null {
  const col = level === "street" ? "street_key" : level;
  try {
    const r = d.prepare(`SELECT ${col} AS c FROM postcodes WHERE postcode=?`).get(pc) as
      | { c: string | null }
      | undefined;
    return r?.c || null;
  } catch {
    return null;
  }
}

/**
 * EPC & retrofit risk: share of EPC-rated homes at D or below near a postcode,
 * walking street → sector → LSOA → MSOA and taking the first level with
 * n ≥ min_n (default 10, same default as lib/street.ts).
 */
export function getEpcSignal(postcode: string): ContextSignal {
  const unavailable = (headline: string): ContextSignal => ({
    key: "epc",
    label: "EPC & retrofit risk",
    available: false,
    score: null,
    direction: "risk",
    headline,
    facts: {},
    method:
      "Score is the London percentile of the D-or-below share at the chosen area level.",
    source: "MHCLG domestic EPC certificates (via main-repo extract)",
    asof: loadData()?.asof ?? "unknown",
  });
  const pc = normalisePostcode(postcode);
  if (!pc) return unavailable(`"${postcode}" is not a valid postcode.`);
  const d = getStreetDb();
  if (!d) return unavailable(`No postcode data available for ${pc}.`);
  let prow: { sector: string } | undefined;
  try {
    prow = d.prepare("SELECT sector FROM postcodes WHERE postcode=?").get(pc) as
      | { sector: string }
      | undefined;
  } catch {
    prow = undefined;
  }
  if (!prow) return unavailable(`${pc} is outside the London area covered.`);
  const data = loadData();
  if (!data) return unavailable(`No EPC data available for ${pc}.`);

  for (const level of LADDER) {
    const code = areaCode(d, level, pc);
    if (!code) continue;
    const agg = data.levels[level]?.[code];
    if (!agg || agg.n < (data.min_n ?? 10)) continue;
    const fmtPct = (x: number): string => {
      const r = Math.round(x * 100);
      return r === 0 && x > 0 ? "<1" : String(r);
    };
    const dgPct = fmtPct(agg.dg);
    const egPct = fmtPct(agg.eg);
    const fgPct = fmtPct(agg.fg);
    return {
      key: "epc",
      label: "EPC & retrofit risk",
      available: true,
      score: agg.pct,
      direction: "risk",
      headline: `${dgPct}% of ${agg.n} EPC-rated homes at ${level} level near ${pc} are rated D or below (median ${agg.med}); ${egPct}% are E or below and ${fgPct}% F/G, which cannot be let under the current EPC-E minimum.`,
      facts: {
        postcode: pc,
        level,
        n: agg.n,
        share_dg: agg.dg,
        share_eg: agg.eg,
        share_fg: agg.fg,
        median_rating: agg.med,
        pct_dg_london: agg.pct,
        mees_min_in_force: "E",
        mees_proposed: "C by 2030 (announced, not in force)",
      },
      method: `Score is the London percentile of the D-or-below share across ${level} areas (100 = worst).`,
      source: data.source,
      asof: data.asof,
    };
  }
  return unavailable(`Too few EPC-rated homes near ${pc} for a reliable signal.`);
}
