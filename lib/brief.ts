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

/** Briefs recorded live by scripts/precompute-briefs.ts; reused only while the exact input still matches. */
export const BRIEF_CACHE_FILE = path.join(process.cwd(), "data", "demo-cache", "briefs.json");
type BriefRecord = { input: string; brief: Brief };
let recordedBriefs: Record<string, BriefRecord> | null = null;
async function recordedBrief(): Promise<Record<string, BriefRecord>> {
  if (recordedBriefs) return recordedBriefs;
  try {
    recordedBriefs = JSON.parse(await fs.readFile(BRIEF_CACHE_FILE, "utf8")) as Record<string, BriefRecord>;
  } catch {
    recordedBriefs = {};
  }
  return recordedBriefs!;
}
const liveBriefs = new Map<string, { input: string; brief: Brief }>();

export async function briefForBorough(code: string, opts: { skipRecorded?: boolean } = {}): Promise<Brief & { _input?: string }> {
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
    momentum: d.momentum == null ? null : Math.round(d.momentum * 1000) / 1000,
    avgRent: d.avgRent == null ? null : Math.round(d.avgRent),
    rentChange: r1(d.rentChange),
    grossYield: r1(d.grossYield),
    priceToRent: r1(d.priceToRent),
    latestSales: d.latestSales,
    salesChange: d.salesChange == null ? null : Math.round(d.salesChange * 1000) / 1000,
    newBuildShare: d.newBuildShare == null ? null : Math.round(d.newBuildShare * 1000) / 1000,
  };
  const input = JSON.stringify(metrics);
  if (process.env.MOCK_META !== "1" && !opts.skipRecorded) {
    const rec = (await recordedBrief())[code];
    if (rec && rec.input === input) return rec.brief;
    const live = liveBriefs.get(code);
    if (live && live.input === input) return live.brief;
  }
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
    const out = enforceConfidence(brief, {
      latestPrice: metrics.latestPrice,
      priceChange: metrics.priceChange,
      netBuildup: metrics.netBuildup,
      pressure: metrics.pressure,
      momentum: metrics.momentum,
    });
    if (process.env.MOCK_META !== "1") liveBriefs.set(code, { input, brief: out });
    return opts.skipRecorded ? { ...out, _input: input } : out;
  } catch {
    return fallbackBrief(d.name, d.code);
  }
}
