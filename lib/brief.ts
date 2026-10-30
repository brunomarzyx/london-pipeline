import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { chatJSON } from "./meta";
import { getBoroughDetail } from "./db";

export const BriefSchema = z.object({
  headline: z.string().min(1).max(300),
  supply_view: z.string().min(1).max(1000),
  price_view: z.string().min(1).max(1000),
  risk_flag: z.enum(["low", "medium", "high"]),
  confidence: z.string().min(1).max(50),
});

export type Brief = z.infer<typeof BriefSchema>;

export function fallbackBrief(name: string, code: string): Brief {
  return {
    headline: `${name} — brief unavailable`,
    supply_view: "No model brief available; use the pipeline figures on this page.",
    price_view: "No model brief available; use the price figures on this page.",
    risk_flag: "medium",
    confidence: "low",
  };
}

// Confidence rests on the core metrics only; a null momentum (small base) doesn't lower it.
const CORE_METRICS = ["latestPrice", "priceChange", "netBuildup"] as const;

export function enforceConfidence(brief: Brief, metrics: { [k: string]: number | null }): Brief {
  const missing = CORE_METRICS.filter((k) => metrics[k] == null).length;
  const confidence = missing === 0 ? "high" : missing === 1 ? "medium" : "low";
  return brief.confidence === confidence ? brief : { ...brief, confidence };
}

export async function briefForBorough(code: string): Promise<Brief> {
  const d = getBoroughDetail(code);
  if (!d) return fallbackBrief(code, code);
  const r1 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
  const metrics = {
    code: d.code,
    name: d.name,
    latestPrice: d.latestPrice == null ? null : Math.round(d.latestPrice),
    priceChange: r1(d.priceChange),
    netBuildup: d.netBuildup,
    pressure: r1(d.pressure),
    momentum: r1(d.momentum),
  };
  const system = await fs.readFile(
    path.join(process.cwd(), "prompts", "brief.md"),
    "utf8",
  );
  try {
    const brief = await chatJSON(JSON.stringify(metrics), BriefSchema, {
      system,
      effort: "low",
      maxTokens: 2048, // reasoning tokens count toward the budget
      fixture: "brief",
    });
    return enforceConfidence(brief, {
      latestPrice: metrics.latestPrice,
      priceChange: metrics.priceChange,
      netBuildup: metrics.netBuildup,
      pressure: metrics.pressure,
      momentum: metrics.momentum,
    });
  } catch {
    return fallbackBrief(d.name, d.code);
  }
}
