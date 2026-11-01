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
  "DfE Get Information About Schools (GIAS) all-establishments extract " +
  "https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/ " +
  "Ofsted state-funded schools inspections and outcomes management information " +
  "https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes";
const METHOD =
  "Score is the London percentile (0=best, 100=worst) of nearest-good-primary distance plus nearest-good-secondary distance, equal weights.";
const KEY = "schools";
const LABEL = "School access";

let db: Database.Database | null = null;
let dbMissing = false;

function contextPath(): string {
  return (
    process.env.SCHOOLS_CONTEXT_PATH ??
    path.join(process.cwd(), "data", "context", "schools.db")
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

/** Test hook: drop the cached connection (e.g. after changing SCHOOLS_CONTEXT_PATH). */
export function resetSchoolsDb(): void {
  try {
    db?.close();
  } catch {
    /* ignore */
  }
  db = null;
  dbMissing = false;
}

function unavailable(headline: string, asof = "2026-10-31"): ContextSignal {
  return {
    key: KEY,
    label: LABEL,
    available: false,
    score: null,
    direction: "amenity",
    headline,
    facts: {},
    method: METHOD,
    source: SOURCE,
    asof,
  };
}

function fmtM(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** School access: distance to nearest good/outstanding primary and secondary. */
export function getSchoolsSignal(postcode: string): ContextSignal {
  const pc = normalisePostcode(postcode);
  if (!pc) return unavailable(`“${postcode}” is not a valid UK postcode.`);
  const d = getDb();
  if (!d) return unavailable("Schools data is not available.");
  try {
    const metaRows = d.prepare("SELECT key, value FROM meta").all() as {
      key: string;
      value: string;
    }[];
    const meta: Record<string, string> = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
    const asof = meta["asof_gias"] ?? "2026-10-31";
    const m = d
      .prepare("SELECT * FROM postcode_metrics WHERE postcode=?")
      .get(pc) as
      | {
          pri_urn: string;
          pri_m: number;
          sec_urn: string;
          sec_m: number;
          pri_good_1km: number;
          sec_good_1km: number;
          score: number;
        }
      | undefined;
    if (!m) return unavailable(`No schools data covers postcode ${pc}.`, asof);
    const pri = d.prepare("SELECT name, rating, inspection_date FROM schools WHERE urn=?").get(m.pri_urn) as
      | { name: string; rating: number | null; inspection_date: string | null }
      | undefined;
    const sec = d.prepare("SELECT name, rating, inspection_date FROM schools WHERE urn=?").get(m.sec_urn) as
      | { name: string; rating: number | null }
      | undefined;
    const priName = pri?.name ?? "nearest good primary";
    const secName = sec?.name ?? "nearest good secondary";
    const total1km = m.pri_good_1km + m.sec_good_1km;
    return {
      key: KEY,
      label: LABEL,
      available: true,
      score: m.score,
      direction: "amenity",
      headline:
        `Nearest good/outstanding primary is ${priName} (${fmtM(m.pri_m)} away); ` +
        `nearest good/outstanding secondary is ${secName} (${fmtM(m.sec_m)} away); ` +
        `${total1km} good/outstanding school${total1km === 1 ? "" : "s"} within 1 km.`,
      facts: {
        postcode: pc,
        nearest_good_primary_m: m.pri_m,
        nearest_good_primary_name: priName,
        nearest_good_primary_rating: pri?.rating ?? null,
        nearest_good_primary_inspection_date: pri?.inspection_date ?? null,
        nearest_good_secondary_m: m.sec_m,
        nearest_good_secondary_name: secName,
        nearest_good_secondary_rating: sec?.rating ?? null,
        nearest_good_secondary_inspection_date: (sec as { inspection_date?: string | null } | undefined)?.inspection_date ?? null,
        good_primaries_within_1km: m.pri_good_1km,
        good_secondaries_within_1km: m.sec_good_1km,
      },
      method: METHOD,
      source: SOURCE,
      asof,
    };
  } catch {
    return unavailable("Schools data is not available.");
  }
}
