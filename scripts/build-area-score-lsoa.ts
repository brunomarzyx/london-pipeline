/** Precompute buyer/investor Area Risk Scores per LSOA for the /screen filters.
 * Run: npx esbuild scripts/build-area-score-lsoa.ts --bundle --platform=node --format=esm --outfile=/tmp/area-score-lsoa.mjs --external:better-sqlite3 && node /tmp/area-score-lsoa.mjs
 * Writes data/context/area-score-lsoa.json. Re-run when street.db or signal data changes.
 * Live scoring of all ~5k representative postcodes takes ~2.7s, so the screen joins this file instead. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { getStreetDb } from "../lib/street";
import { getAreaScore } from "../lib/area-score";
import { getFloodSignal } from "../lib/context/flood";

const OUT = path.join(process.cwd(), "data", "context", "area-score-lsoa.json");

async function main(): Promise<void> {
  const d = getStreetDb();
  if (!d) throw new Error("street.db missing");
  const rows = d
    .prepare(
      `SELECT l.code AS lsoa,
        (SELECT s.postcode FROM sales s WHERE s.lsoa = l.code GROUP BY s.postcode ORDER BY count(*) DESC LIMIT 1) AS postcode
       FROM area_stats l
       WHERE l.level = 'lsoa' AND l.med_ppsm IS NOT NULL
         AND EXISTS (SELECT 1 FROM postcodes p WHERE p.lsoa = l.code)`,
    )
    .all() as { lsoa: string; postcode: string | null }[];
  const out: Record<
    string,
    { postcode: string | null; buyer: number | null; investor: number | null; floodZone3: boolean | null }
  > = {};
  for (const r of rows) {
    if (!r.postcode) {
      out[r.lsoa] = { postcode: null, buyer: null, investor: null, floodZone3: null };
      continue;
    }
    const b = getAreaScore(r.postcode, "buyer");
    const floodZone = getFloodSignal(r.postcode).facts.floodZone;
    out[r.lsoa] = {
      postcode: r.postcode,
      buyer: b.lowCoverage ? null : b.score,
      investor: (() => {
        const i = getAreaScore(r.postcode as string, "investor");
        return i.lowCoverage ? null : i.score;
      })(),
      floodZone3: typeof floodZone === "number" ? floodZone === 3 : null,
    };
  }
  const asof = (d.prepare("SELECT value FROM meta WHERE key='asof'").get() as { value: string } | undefined)?.value ?? null;
  await fs.writeFile(OUT, JSON.stringify({ asof, note: "Buyer/investor Area Risk Score per LSOA at its busiest postcode; null when low coverage. Rebuild with scripts/build-area-score-lsoa.ts.", rows: out }));
  console.log(`wrote ${OUT} (${rows.length} LSOAs)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
