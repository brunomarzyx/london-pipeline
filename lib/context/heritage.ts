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
  "planning.data.gov.uk datasets conservation-area, listed-building and article-4-direction-area " +
  "https://files.planning.data.gov.uk/dataset/conservation-area.csv, " +
  "https://files.planning.data.gov.uk/dataset/listed-building.csv, " +
  "https://files.planning.data.gov.uk/dataset/article-4-direction-area.csv";
const METHOD =
  "Banded planning-constraint score: 0 none nearby; 40 listed building(s) within 100 m only; " +
  "70 inside a conservation area and/or Article 4 area; 100 compounding controls (inside plus listed nearby, or both areas).";
const KEY = "heritage";
const LABEL = "Heritage planning constraint";

let db: Database.Database | null = null;
let dbMissing = false;

function contextPath(): string {
  return (
    process.env.HERITAGE_CONTEXT_PATH ??
    path.join(process.cwd(), "data", "context", "heritage.db")
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

/** Test hook: drop the cached connection (e.g. after changing HERITAGE_CONTEXT_PATH). */
export function resetHeritageDb(): void {
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
    direction: "risk", headline, facts: {},
    method: METHOD, source: SOURCE, asof,
  };
}

/** Heritage planning constraint: conservation area, nearby listings, Article 4. */
export function getHeritageSignal(postcode: string): ContextSignal {
  const pc = normalisePostcode(postcode);
  if (!pc) return unavailable(`“${postcode}” is not a valid UK postcode.`);
  const d = getDb();
  if (!d) return unavailable("Heritage data is not available.");
  try {
    const metaRows = d.prepare("SELECT key, value FROM meta").all() as {
      key: string;
      value: string;
    }[];
    const meta: Record<string, string> = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
    const asof = meta["asof"] ?? "2026-11-01";
    const m = d
      .prepare("SELECT * FROM postcode_metrics WHERE postcode=?")
      .get(pc) as
      | {
          in_ca: number; ca_name: string | null; listed_100m: number;
          nearest_listed_m: number | null; nearest_listed_name: string | null;
          nearest_listed_grade: string | null; in_a4: number; a4_ref: string | null;
          score: number;
        }
      | undefined;
    if (!m) return unavailable(`No heritage data covers postcode ${pc}.`, asof);
    const parts: string[] = [];
    if (m.in_ca) parts.push(`inside the ${m.ca_name} conservation area`);
    if (m.in_a4) parts.push("inside an Article 4 direction area");
    if (m.listed_100m > 0) {
      parts.push(
        `${m.listed_100m} listed building${m.listed_100m === 1 ? "" : "s"} within 100 m` +
        (m.nearest_listed_name ? ` (nearest: ${m.nearest_listed_name}` +
          (m.nearest_listed_grade ? `, Grade ${m.nearest_listed_grade}` : "") +
          (m.nearest_listed_m !== null ? `, ${Math.round(m.nearest_listed_m)} m away)` : ")") : ""),
      );
    }
    const headline =
      parts.length === 0
        ? "No conservation area, nearby listed building or Article 4 direction recorded here — standard permitted-development rights apply."
        : `Planning constraint: ${parts.join("; ")}. Extensions and alterations are harder — check with the borough.`;
    return {
      key: KEY,
      label: LABEL,
      available: true,
      score: m.score,
      direction: "risk",
      headline,
      facts: {
        postcode: pc,
        in_conservation_area: m.in_ca === 1,
        conservation_area_name: m.ca_name,
        listed_buildings_within_100m: m.listed_100m,
        nearest_listed_m: m.nearest_listed_m,
        nearest_listed_name: m.nearest_listed_name,
        nearest_listed_grade: m.nearest_listed_grade,
        in_article_4_area: m.in_a4 === 1,
        article_4_ref: m.a4_ref,
      },
      method: METHOD,
      source: SOURCE,
      asof,
    };
  } catch {
    return unavailable("Heritage data is not available.");
  }
}
