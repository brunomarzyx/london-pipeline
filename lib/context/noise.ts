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
  "Defra strategic noise mapping Round 4 (2022) Lden, road and rail";
const SOURCE_URL = "https://environment.data.gov.uk/spatialdata/noise-data/wms";
const METHOD =
  "Postcode sampled from Defra 10 m Lden grids (road + rail); score 15/50/80/95 for the noisier source's band (low/medium/high/very high).";

let db: Database.Database | null = null;
let dbMissing = false;

function getDb(): Database.Database | null {
  if (db) return db;
  if (dbMissing) return null;
  try {
    const p =
      process.env.NOISE_DB_PATH ??
      path.join(process.cwd(), "data", "context", "noise.db");
    db = new Database(p, { readonly: true });
    return db;
  } catch {
    dbMissing = true;
    return null;
  }
}

export function resetNoiseDbForTest(): void {
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

type NoiseRow = {
  road_lden: number | null;
  rail_lden: number | null;
  band: string;
  score: number;
};

export function getNoiseSignal(postcode: string): ContextSignal {
  const base = {
    key: "noise",
    label: "Noise",
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
      headline: "Noise data is not available.",
      facts: { postcode: pc },
    };
  }
  let row: NoiseRow | undefined;
  try {
    row = d
      .prepare("SELECT road_lden, rail_lden, band, score FROM noise WHERE postcode = ?")
      .get(pc) as NoiseRow | undefined;
  } catch {
    return {
      ...base,
      available: false,
      score: null,
      headline: "Noise data is not available.",
      facts: { postcode: pc },
    };
  }
  if (!row || !row.band) {
    return {
      ...base,
      available: false,
      score: null,
      headline: `${pc} is outside the modelled London postcode set.`,
      facts: { postcode: pc },
    };
  }
  const road = row.road_lden == null ? null : Math.round(row.road_lden * 10) / 10;
  const rail = row.rail_lden == null ? null : Math.round(row.rail_lden * 10) / 10;
  // Grid value 0 means below the strategic-mapping threshold (<55 dB), not 0 dB of sound.
  const roadStr = road != null && road > 0 ? `${road} dB` : "below mapping threshold";
  const railStr = rail != null && rail > 0 ? `${rail} dB` : "below mapping threshold";
  return {
    ...base,
    available: true,
    score: row.score,
    headline: `${pc} is in the ${row.band} noise band (road Lden ${roadStr}, rail Lden ${railStr}; bands: <55 low, 55–65 medium, 65–70 high, >70 very high).`,
    facts: { postcode: pc, roadLden: road, railLden: rail, band: row.band },
  };
}
