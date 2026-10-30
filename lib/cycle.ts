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

export async function explainCyclePhase(code: string): Promise<string> {
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
    return out.explanation;
  } catch {
    return fallbackCycleParagraph(d.name, phase, d.priceChange, d.pressure);
  }
}
