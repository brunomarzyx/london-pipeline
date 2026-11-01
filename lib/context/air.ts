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
  "GLA/TfL London Atmospheric Emissions Inventory (LAEI) 2022 modelled annual-mean concentrations";
const SOURCE_URL =
  "https://data.london.gov.uk/dataset/london-atmospheric-emissions-inventory--laei--2022";
const METHOD =
  "Postcode sampled from the LAEI 20 m NO2 grid; score is the London percentile of NO2 (100 = dirtiest).";

let db: Database.Database | null = null;
let dbMissing = false;

function getDb(): Database.Database | null {
  if (db) return db;
  if (dbMissing) return null;
  try {
    const p =
      process.env.AIR_DB_PATH ??
      path.join(process.cwd(), "data", "context", "air.db");
    db = new Database(p, { readonly: true });
    return db;
  } catch {
    dbMissing = true;
    return null;
  }
}

export function resetAirDbForTest(): void {
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

type AirRow = { no2: number; pm25: number; score: number };

export function getAirSignal(postcode: string): ContextSignal {
  const base = {
    key: "air",
    label: "Air quality",
    direction: "risk" as const,
    method: METHOD,
    source: `${SOURCE} — ${SOURCE_URL}`,
    asof: "2022",
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
      headline: "Air quality data is not available.",
      facts: { postcode: pc },
    };
  }
  let row: AirRow | undefined;
  try {
    row = d
      .prepare("SELECT no2, pm25, score FROM air WHERE postcode = ?")
      .get(pc) as AirRow | undefined;
  } catch {
    return {
      ...base,
      available: false,
      score: null,
      headline: "Air quality data is not available.",
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
  const no2 = Math.round(row.no2 * 10) / 10;
  const pm25 = Math.round(row.pm25 * 10) / 10;
  return {
    ...base,
    available: true,
    score: row.score,
    headline: `${pc} has modelled annual-mean NO2 of ${no2} µg/m³ (dirtier than ${row.score}% of London postcodes; WHO 2021 guideline is 10 µg/m³).`,
    facts: {
      postcode: pc,
      no2,
      pm25,
      no2Percentile: row.score,
      whoNo2Guideline: 10,
      whoPm25Guideline: 5,
      exceedsWhoNo2: no2 > 10,
      exceedsWhoPm25: pm25 > 5,
    },
  };
}
