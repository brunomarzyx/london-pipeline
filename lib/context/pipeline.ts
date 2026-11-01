import fs from "node:fs";
import path from "node:path";
import { normalisePostcode, getStreetDb } from "../street";
import type { ContextSignal } from "./epc";

export type PipelineScheme = {
  ref: string | null;
  name: string;
  borough: string | null;
  units: number;
  status: string;
  dec: string | null;
  dist_km: number;
};

type Agg = { ns: number; st: number; tot: number; pct: number; top: PipelineScheme[] };

let cache: {
  asof: string;
  source: string;
  note: string;
  lsoa: Record<string, Agg>;
  totals: { records: number; sites: number; active: number };
} | null = null;
let cacheMissing = false;

function pipelineDataPath(): string {
  return (
    process.env.PIPELINE_DATA_PATH ??
    path.join(process.cwd(), "data", "context", "pipeline.json")
  );
}

function loadData(): typeof cache {
  if (cacheMissing) return null;
  if (cache) return cache;
  const p = pipelineDataPath();
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

/** Test hook: clear cached data (e.g. after changing PIPELINE_DATA_PATH). */
export function resetPipelineData(): void {
  cache = null;
  cacheMissing = false;
}

const STATUS_LABEL: Record<string, string> = {
  not_started: "approved, not started",
  started: "under construction",
};

/**
 * New housing supply: units approved-not-started plus under construction
 * within 1 km of the postcode's LSOA centroid, scored as the London
 * percentile of that pressure across LSOAs (100 = worst), with the top 3
 * schemes by units.
 */
export function getPipelineSignal(postcode: string): ContextSignal {
  const unavailable = (headline: string): ContextSignal => ({
    key: "pipeline",
    label: "New housing supply",
    available: false,
    score: null,
    direction: "risk",
    headline,
    facts: {},
    method: "Score is the London percentile of pipeline units within 1 km across LSOAs.",
    source: "Planning London Datahub",
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
  if (!data) return unavailable(`No housing-supply data available for ${pc}.`);
  const agg = data.lsoa[lsoa];
  if (!agg) return unavailable(`No housing-supply data available for ${pc}.`);
  const top = agg.top ?? [];
  const topFacts = top.map(
    (t) => `${t.units} units (${t.ref ?? "no ref"}, ${STATUS_LABEL[t.status] ?? t.status})`,
  );
  const headline =
    agg.tot === 0
      ? `No approved-but-unbuilt or under-construction homes within 1 km of ${pc} — among the lowest supply pressure in London.`
      : `${agg.tot.toLocaleString("en-GB")} pipeline homes within 1 km of ${pc} (${agg.ns.toLocaleString("en-GB")} approved, not started; ${agg.st.toLocaleString("en-GB")} under construction), higher than in ${Math.round(agg.pct)}% of London LSOAs.` +
        (top.length > 0 ? ` Largest: ${topFacts.join("; ")}.` : "");
  return {
    key: "pipeline",
    label: "New housing supply",
    available: true,
    score: agg.pct,
    direction: "risk",
    headline,
    facts: {
      postcode: pc,
      lsoa,
      units_not_started_1km: agg.ns,
      units_under_construction_1km: agg.st,
      units_pipeline_1km: agg.tot,
      pct_pipeline_london: agg.pct,
      top1_ref: top[0]?.ref ?? null,
      top1_units: top[0]?.units ?? null,
      top1_status: top[0] ? (STATUS_LABEL[top[0].status] ?? top[0].status) : null,
      top2_ref: top[1]?.ref ?? null,
      top2_units: top[1]?.units ?? null,
      top2_status: top[1] ? (STATUS_LABEL[top[1].status] ?? top[1].status) : null,
      top3_ref: top[2]?.ref ?? null,
      top3_units: top[2]?.units ?? null,
      top3_status: top[2] ? (STATUS_LABEL[top[2].status] ?? top[2].status) : null,
    },
    method:
      "Score is the London percentile of approved-not-started plus under-construction units within 1 km across all London LSOAs (100 = worst).",
    source: data.source,
    asof: data.asof,
  };
}
