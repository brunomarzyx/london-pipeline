/**
 * Records one live run of each demo input into data/demo-cache/<id>.json (see lib/demo-cache.ts).
 * COSTS MODEL CREDITS (about 10 model calls). Run it deliberately, once, before recording:
 *   npx tsx --env-file=.env scripts/precompute-demo.ts [id ...]
 * With MOCK_META=1 it only writes when DEMO_CACHE_DIR points away from data/demo-cache,
 * so fixture results are never mistaken for a live recording.
 */
import { askQuestion } from "../lib/ask";
import { runDiligence } from "../lib/diligence";
import { extractListing } from "../lib/listing";
import { DEMO_INPUTS, cacheDir, writeCache } from "../lib/demo-cache";

async function main(): Promise<void> {
  const mock = process.env.MOCK_META === "1";
  if (mock && !process.env.DEMO_CACHE_DIR) {
    console.error("MOCK_META=1: set DEMO_CACHE_DIR to a scratch folder to test, or unset MOCK_META for a live run.");
    process.exit(1);
  }
  const only = process.argv.slice(2);
  const todo = DEMO_INPUTS.filter((d) => only.length === 0 || only.includes(d.id));
  if (todo.length === 0) {
    console.error(`no matching ids; known: ${DEMO_INPUTS.map((d) => d.id).join(", ")}`);
    process.exit(1);
  }
  for (const d of todo) {
    const t0 = Date.now();
    let result: unknown;
    if (d.kind === "ask") result = await askQuestion(String(d.input.question));
    else if (d.kind === "diligence")
      result = await runDiligence({
        text: String(d.input.text),
        goal: d.input.goal === "investor" ? "investor" : "buyer",
      });
    else result = await extractListing(String(d.input.text));
    await writeCache(d.id, d.kind, d.input, result, mock);
    console.log(`${d.id}: saved to ${cacheDir()} (${Date.now() - t0} ms)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
