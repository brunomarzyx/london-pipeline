/**
 * Records one live Muse Spark brief per borough into data/demo-cache/briefs.json so borough
 * pages render instantly and don't call the model on every view. A record is used only while
 * the exact metrics input it was written from still matches.
 * COSTS MODEL CREDITS (33 small calls). Run deliberately:
 *   npx tsx --env-file=.env scripts/precompute-briefs.ts [E09… …]   (codes = re-record only those)
 */
import { promises as fs } from "node:fs";
import { getAllMetrics } from "../lib/db";
import { BRIEF_CACHE_FILE, briefForBorough, type Brief } from "../lib/brief";

async function main(): Promise<void> {
  if (process.env.MOCK_META === "1") {
    console.error("MOCK_META=1: unset it for a live run.");
    process.exit(1);
  }
  const only = process.argv.slice(2);
  let out: Record<string, { input: string; brief: Brief }> = {};
  if (only.length) {
    try { out = JSON.parse(await fs.readFile(BRIEF_CACHE_FILE, "utf8")); } catch { out = {}; }
  }
  let fallbacks = 0;
  for (const b of getAllMetrics().filter((m) => only.length === 0 || only.includes(m.code))) {
    const { _input, ...brief } = await briefForBorough(b.code, { skipRecorded: true });
    if (!_input) {
      fallbacks++;
      console.log(`${b.name}: fallback, not recorded`);
      continue;
    }
    out[b.code] = { input: _input, brief };
    console.log(`${b.name}: ok`);
  }
  await fs.writeFile(BRIEF_CACHE_FILE, JSON.stringify(out, null, 1));
  console.log(`recorded ${Object.keys(out).length}, fallbacks ${fallbacks}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
