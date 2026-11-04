/**
 * Records one live Muse Spark cycle explanation per borough into data/demo-cache/cycle.json,
 * so borough pages render instantly and don't spend credits on every machine restart.
 * A record is used only while the phase, price change and pressure it was written from still match.
 * COSTS MODEL CREDITS (33 small calls). Run deliberately:
 *   npx tsx --env-file=.env scripts/precompute-cycle.ts [E09… …]   (codes = re-record only those)
 */
import { promises as fs } from "node:fs";
import { getAllMetrics } from "../lib/db";
import { CYCLE_CACHE_FILE, classifyCycle, explainCyclePhase, type CycleRecord } from "../lib/cycle";

async function main(): Promise<void> {
  if (process.env.MOCK_META === "1") {
    console.error("MOCK_META=1: unset it for a live run.");
    process.exit(1);
  }
  const r1 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
  const only = process.argv.slice(2);
  let out: Record<string, CycleRecord> = {};
  if (only.length) {
    try { out = JSON.parse(await fs.readFile(CYCLE_CACHE_FILE, "utf8")); } catch { out = {}; }
  }
  let fallbacks = 0;
  for (const b of getAllMetrics().filter((m) => only.length === 0 || only.includes(m.code))) {
    const phase = classifyCycle(b.priceChange, b.pressure, b.momentum);
    const text = await explainCyclePhase(b.code, { skipRecorded: true });
    if (/No model explanation is available/.test(text)) {
      fallbacks++;
      console.log(`${b.name}: fallback, not recorded`);
      continue;
    }
    out[b.code] = { phase, priceChange: r1(b.priceChange), pressure: r1(b.pressure), text };
    console.log(`${b.name}: ${phase} ok`);
  }
  await fs.writeFile(CYCLE_CACHE_FILE, JSON.stringify(out, null, 1));
  console.log(`recorded ${Object.keys(out).length}, fallbacks ${fallbacks}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
