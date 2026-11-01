import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

// Estimate: assumed blended price per 1k tokens (prompt + completion).
// Not a billed rate — Meta pricing may differ. Labelled estimate.
export const PRICE_PER_1K_TOKENS_USD_ESTIMATE = 0.0;

interface DayTotals {
  calls: number;
  liveCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

const zero = (): DayTotals => ({
  calls: 0,
  liveCalls: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
});

const cost = (t: number): string =>
  `$${((t / 1000) * PRICE_PER_1K_TOKENS_USD_ESTIMATE).toFixed(4)} (estimate)`;

async function main(): Promise<void> {
  const file = path.join(process.cwd(), "logs", "usage.jsonl");
  if (!existsSync(file)) {
    console.log("no usage log found at logs/usage.jsonl");
    return;
  }
  const byDay = new Map<string, DayTotals>();
  const rl = createInterface({
    input: createReadStream(file),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    let r: {
      ts?: string;
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      mock?: boolean;
    };
    try {
      r = JSON.parse(t) as typeof r;
    } catch {
      continue;
    }
    // Records written before Phase 12 have no ts; bucket them as unknown.
    const day =
      typeof r.ts === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.ts)
        ? r.ts.slice(0, 10)
        : "unknown-date";
    let d = byDay.get(day);
    if (!d) {
      d = zero();
      byDay.set(day, d);
    }
    const pt = r.prompt_tokens ?? 0;
    const ct = r.completion_tokens ?? 0;
    d.calls += 1;
    if (r.mock !== true) d.liveCalls += 1;
    d.promptTokens += pt;
    d.completionTokens += ct;
    d.totalTokens += r.total_tokens ?? pt + ct;
  }
  const all = zero();
  for (const d of byDay.values()) {
    all.calls += d.calls;
    all.liveCalls += d.liveCalls;
    all.promptTokens += d.promptTokens;
    all.completionTokens += d.completionTokens;
    all.totalTokens += d.totalTokens;
  }
  console.log(
    `calls: ${all.calls} (live ${all.liveCalls}, mock ${all.calls - all.liveCalls})`,
  );
  console.log(
    `tokens: prompt=${all.promptTokens} completion=${all.completionTokens} total=${all.totalTokens}`,
  );
  console.log(
    `est. cost @ $${PRICE_PER_1K_TOKENS_USD_ESTIMATE}/1k tokens: ${cost(all.totalTokens)}`,
  );
  console.log("by day:");
  for (const [day, d] of [...byDay.entries()].sort()) {
    console.log(
      `  ${day}: calls=${d.calls} live=${d.liveCalls} prompt=${d.promptTokens} completion=${d.completionTokens} total=${d.totalTokens} cost=${cost(d.totalTokens)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
