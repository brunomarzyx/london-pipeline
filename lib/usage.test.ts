import { describe, expect, it } from "vitest";
import { estimateCost, pricesFromEnv, summariseUsage } from "./usage";

const live = (p: number, c: number, cached = 0) =>
  JSON.stringify({ mock: false, prompt_tokens: p, completion_tokens: c, cached_tokens: cached, total_tokens: p + c });

describe("usage", () => {
  it("returns null prices without env", () => {
    expect(pricesFromEnv({})).toBeNull();
    expect(estimateCost(100, 0, 100, null)).toBeNull();
  });
  it("reads prices and estimates cost with cached split", () => {
    const pr = pricesFromEnv({ META_PRICE_IN_PER_M: "2", META_PRICE_OUT_PER_M: "10", META_PRICE_CACHED_PER_M: "0.5" })!;
    expect(estimateCost(1_000_000, 500_000, 100_000, pr)).toBeCloseTo(0.5 * 2 + 0.5 * 0.5 + 0.1 * 10, 10);
  });
  it("sums live calls, skips mock, counts legacy and bad lines", () => {
    const text = [
      live(1000, 200, 100),
      live(500, 50),
      JSON.stringify({ mock: true, prompt_tokens: 0 }),
      JSON.stringify({ model: "x", prompt: "old" }),
      "not json",
      "",
    ].join("\n");
    const s = summariseUsage(text, null);
    expect(s).toMatchObject({
      calls: 4, liveCalls: 3, mockCalls: 1, liveCallsWithoutTokens: 1, badLines: 1,
      promptTokens: 1500, completionTokens: 250, cachedTokens: 100, totalTokens: 1750,
      estCostUsd: null, priced: false,
    });
  });
});
