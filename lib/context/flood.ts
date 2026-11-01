import Database from "better-sqlite3";
import path from "node:path";
import { normalisePostcode } from "../street";

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
  "Environment Agency Flood Map for Planning (Rivers and Sea) via planning.data.gov.uk dataset flood-risk-zone";
const SOURCE_URL = "https://planning.data.gov.uk/dataset/flood-risk-zone";
const METHOD =
  "Postcode point-in-polygon against EA Flood Zones; score 5 for Zone 1, 55 for Zone 2, 90 for Zone 3.";

let db: Database.Database | null = null;
let dbMissing = false;

function getDb(): Database.Database | null {
  if (db) return db;
  if (dbMissing) return null;
  try {
    const p =
      process.env.FLOOD_DB_PATH ??
      path.join(process.cwd(), "data", "context", "flood.db");
    db = new Database(p, { readonly: true });
    return db;
  } catch {
    dbMissing = true;
    return null;
  }
}

export function resetFloodDbForTest(): void {
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
  db = null;
  dbMissing = false;
}

type FloodRow = { zone: number | null; score: number | null };

const ZONE_WORD: Record<number, string> = {
  1: "Flood Zone 1 (low probability)",
  2: "Flood Zone 2 (medium probability)",
  3: "Flood Zone 3 (high probability)",
};

export function getFloodSignal(postcode: string): ContextSignal {
  const base = {
    key: "flood",
    label: "Flood risk",
    direction: "risk" as const,
    method: METHOD,
    source: `${SOURCE} — ${SOURCE_URL}`,
    asof: "2023-08-24",
  };
  const pc = normalisePostcode(postcode);
  if (!pc) {
    return {
      ...base,
      available: false,
      score: null,
      headline: `Postcode "${postcode}" is not a valid UK postcode.`,
      facts: { postcode },
    };
  }
  const d = getDb();
  if (!d) {
    return {
      ...base,
      available: false,
      score: null,
      headline: "Flood data is not available.",
      facts: { postcode: pc },
    };
  }
  let row: FloodRow | undefined;
  try {
    row = d
      .prepare("SELECT zone, score FROM flood WHERE postcode = ?")
      .get(pc) as FloodRow | undefined;
  } catch {
    return {
      ...base,
      available: false,
      score: null,
      headline: "Flood data is not available.",
      facts: { postcode: pc },
    };
  }
  if (!row) {
    return {
      ...base,
      available: false,
      score: null,
      headline: `${pc} is outside the modelled London postcode set.`,
      facts: { postcode: pc },
    };
  }
  if (row.zone == null || row.score == null) {
    return {
      ...base,
      available: false,
      score: null,
      headline: `${pc} has no coordinates in the postcode lookup, so flood zone cannot be assessed.`,
      facts: { postcode: pc },
    };
  }
  return {
    ...base,
    available: true,
    score: row.score,
    headline: `${pc} is in ${ZONE_WORD[row.zone] ?? `Flood Zone ${row.zone}`}.`,
    facts: { postcode: pc, floodZone: row.zone },
  };
}
