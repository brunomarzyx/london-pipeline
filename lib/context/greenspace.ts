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
  "OS Open Greenspace https://api.os.uk/downloads/v1/products/OpenGreenspace/downloads (TQ square, GML)";
const METHOD =
  "Score is the mean of the London percentile of distance to the nearest public park/garden/playing-field access point and the London percentile of green area within 800 m (inverted), equal weights.";
const KEY = "greenspace";
const LABEL = "Greenspace access";

let db: Database.Database | null = null;
let dbMissing = false;

function contextPath(): string {
  return (
    process.env.GREENSPACE_CONTEXT_PATH ??
    path.join(process.cwd(), "data", "context", "greenspace.db")
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

/** Test hook: drop the cached connection (e.g. after changing GREENSPACE_CONTEXT_PATH). */
export function resetGreenspaceDb(): void {
  try {
    db?.close();
  } catch {
    /* ignore */
  }
  db = null;
  dbMissing = false;
}

function unavailable(headline: string, asof = "2026-11-01"): ContextSignal {
  return {
    key: KEY, label: LABEL, available: false, score: null,
    direction: "amenity", headline, facts: {},
    method: METHOD, source: SOURCE, asof,
  };
}

function fmtM(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtHa(m2: number): string {
  return `${(m2 / 10000).toFixed(1)} ha`;
}

/** Greenspace access: nearest public green access point + green area within 800 m. */
export function getGreenspaceSignal(postcode: string): ContextSignal {
  const pc = normalisePostcode(postcode);
  if (!pc) return unavailable(`“${postcode}” is not a valid UK postcode.`);
  const d = getDb();
  if (!d) return unavailable("Greenspace data is not available.");
  try {
    const metaRows = d.prepare("SELECT key, value FROM meta").all() as {
      key: string;
      value: string;
    }[];
    const meta: Record<string, string> = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
    const asof = meta["asof"] ?? "2026-11-01";
    const m = d
      .prepare("SELECT ap_m, area_800m, score FROM postcode_metrics WHERE postcode=?")
      .get(pc) as { ap_m: number; area_800m: number; score: number } | undefined;
    if (!m) return unavailable(`No greenspace data covers postcode ${pc}.`, asof);
    return {
      key: KEY,
      label: LABEL,
      available: true,
      score: m.score,
      direction: "amenity",
      headline:
        `Nearest public park, garden or playing-field access point is ${fmtM(m.ap_m)} away; ` +
        `${fmtHa(m.area_800m)} of public green space within 800 m.`,
      facts: {
        postcode: pc,
        nearest_access_point_m: m.ap_m,
        green_area_within_800m_m2: m.area_800m,
        green_area_within_800m_ha: Math.round((m.area_800m / 10000) * 10) / 10,
      },
      method: METHOD,
      source: SOURCE,
      asof,
    };
  } catch {
    return unavailable("Greenspace data is not available.");
  }
}
