import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { chatJSON } from "./meta";
import { getBoroughDetail } from "./db";

export * from "./cycle-phase";
import {
  PHASE_LABEL,
  classifyCycle,
  fmtPct,
  fmtPressure,
  type CyclePhase,
} from "./cycle-phase";

export const CycleExplanationSchema = z.object({
  explanation: z.string().min(1).max(1000),
});

export function fallbackCycleParagraph(
  name: string,
  phase: CyclePhase,
  priceChange: number | null,
  pressure: number | null,
): string {
  if (phase === "unknown")
    return `${name} has no cycle phase: ${priceChange == null ? "its 12-month price change is missing" : `its price change is ${fmtPct(priceChange)}`} and ${pressure == null ? "its supply pressure is missing" : `its supply pressure is ${fmtPressure(pressure)}`}, so there is not enough data to classify it.`;
  return `${name} is in the ${PHASE_LABEL[phase].toLowerCase()} phase: its 12-month price change is ${fmtPct(priceChange)} and its supply pressure is ${fmtPressure(pressure)}. No model explanation is available; use the pipeline and price figures on this page.`;
}

const cycleCache = new Map<string, { text: string; at: number }>();
const CYCLE_TTL_MS = 60 * 60 * 1000;

/** Precomputed explanations shipped with the app (scripts/precompute-cycle.ts). */
export type CycleRecord = { phase: CyclePhase; priceChange: number | null; pressure: number | null; text: string };
export const CYCLE_CACHE_FILE = path.join(process.cwd(), "data", "demo-cache", "cycle.json");
let recorded: Record<string, CycleRecord> | null = null;
async function recordedCycle(): Promise<Record<string, CycleRecord>> {
  if (recorded) return recorded;
  try {
    recorded = JSON.parse(await fs.readFile(CYCLE_CACHE_FILE, "utf8")) as Record<string, CycleRecord>;
  } catch {
    recorded = {};
  }
  return recorded!;
}

export async function explainCyclePhase(code: string, opts: { skipRecorded?: boolean } = {}): Promise<string> {
  const hit = cycleCache.get(code);
  if (hit && Date.now() - hit.at < CYCLE_TTL_MS) return hit.text;
  const d = getBoroughDetail(code);
  if (!d) return fallbackCycleParagraph(code, "unknown", null, null);
  const phase = classifyCycle(d.priceChange, d.pressure, d.momentum);
  const r1 = (v: number | null) =>
    v == null ? null : Math.round(v * 100) / 100;
  const metrics = {
    code: d.code,
    name: d.name,
    phase,
    latestPrice: d.latestPrice == null ? null : Math.round(d.latestPrice),
    priceChange: r1(d.priceChange),
    pressure: r1(d.pressure),
    momentum: d.momentum == null ? null : Math.round(d.momentum * 1000) / 1000,
  };
  // A recorded explanation is reused only while the inputs it was written from still hold.
  if (process.env.MOCK_META !== "1" && !opts.skipRecorded) {
    const rec = (await recordedCycle())[code];
    if (rec && rec.phase === phase && rec.priceChange === metrics.priceChange && rec.pressure === metrics.pressure)
      return rec.text;
  }
  const system = await fs.readFile(
    path.join(process.cwd(), "prompts", "cycle.md"),
    "utf8",
  );
  try {
    const out = await chatJSON(JSON.stringify(metrics), CycleExplanationSchema, {
      system,
      effort: "low",
      fixture: "cycle",
    });
    // Cache model text for an hour: the borough page renders server-side, so this caps spend per code.
    if (process.env.MOCK_META !== "1") cycleCache.set(code, { text: out.explanation, at: Date.now() });
    return out.explanation;
  } catch {
    return fallbackCycleParagraph(d.name, phase, d.priceChange, d.pressure);
  }
}
