import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Spend visibility for logs/usage.jsonl.
 * Prices are never assumed: set META_PRICE_IN_PER_M, META_PRICE_CACHED_PER_M
 * (optional, defaults to the input price) and META_PRICE_OUT_PER_M in US$ per
 * million tokens. Without them the cost is reported as null (unpriced).
 */
export interface Prices {
  inPerM: number;
  cachedPerM: number;
  outPerM: number;
}

export function pricesFromEnv(env: Record<string, string | undefined> = process.env): Prices | null {
  const i = Number(env.META_PRICE_IN_PER_M);
  const o = Number(env.META_PRICE_OUT_PER_M);
  if (!(env.META_PRICE_IN_PER_M && env.META_PRICE_OUT_PER_M) || !Number.isFinite(i) || !Number.isFinite(o) || i < 0 || o < 0)
    return null;
  const c = env.META_PRICE_CACHED_PER_M ? Number(env.META_PRICE_CACHED_PER_M) : i;
  return { inPerM: i, cachedPerM: Number.isFinite(c) && c >= 0 ? c : i, outPerM: o };
}

/** Estimated US$ for one call; null when no prices are configured. */
export function estimateCost(
  promptTokens: number,
  cachedTokens: number,
  completionTokens: number,
  prices: Prices | null = pricesFromEnv(),
): number | null {
  if (!prices) return null;
  const cached = Math.min(Math.max(cachedTokens, 0), promptTokens);
  return (
    ((promptTokens - cached) * prices.inPerM +
      cached * prices.cachedPerM +
      completionTokens * prices.outPerM) /
    1e6
  );
}

export interface UsageSummary {
  calls: number;
  liveCalls: number;
  mockCalls: number;
  /** Live calls whose log line has no token counts (written before token logging). */
  liveCallsWithoutTokens: number;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** US$; null when prices are not configured. */
  estCostUsd: number | null;
  priced: boolean;
  badLines: number;
}

export function summariseUsage(
  jsonl: string,
  prices: Prices | null = pricesFromEnv(),
): UsageSummary {
  const s: UsageSummary = {
    calls: 0, liveCalls: 0, mockCalls: 0, liveCallsWithoutTokens: 0,
    promptTokens: 0, cachedTokens: 0, completionTokens: 0, totalTokens: 0,
    estCostUsd: prices ? 0 : null, priced: prices != null, badLines: 0,
  };
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(line);
    } catch {
      s.badLines++;
      continue;
    }
    s.calls++;
    if (d.mock === true) {
      s.mockCalls++;
      continue;
    }
    s.liveCalls++;
    const p = Number(d.prompt_tokens), c = Number(d.completion_tokens);
    if (!Number.isFinite(p) || !Number.isFinite(c)) {
      s.liveCallsWithoutTokens++;
      continue;
    }
    const cached = Number(d.cached_tokens) || 0;
    s.promptTokens += p;
    s.cachedTokens += cached;
    s.completionTokens += c;
    s.totalTokens += Number(d.total_tokens) || p + c;
    if (prices) s.estCostUsd = (s.estCostUsd ?? 0) + (estimateCost(p, cached, c, prices) ?? 0);
  }
  return s;
}

export async function readUsageSummary(file?: string): Promise<UsageSummary> {
  const p = file ?? process.env.USAGE_LOG ?? path.join(process.cwd(), "logs", "usage.jsonl");
  let text = "";
  try {
    text = await fs.readFile(p, "utf8");
  } catch {
    /* no log yet: empty summary */
  }
  return summariseUsage(text);
}
