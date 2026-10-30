import { describe, expect, it } from "vitest";
import {
  badgeText,
  collectToolNumbers,
  extractFigures,
  memoToMarkdown,
  verifyFigures,
  writeMemo,
} from "./memo";

const TOOLS = ['{"code":"E09000007","name":"Camden","latestPrice":447950,"salesChange":-0.1327}'];

describe("extractFigures", () => {
  it("passes formatted money and unicode-minus percents", () => {
    const figs = extractFigures("Average price £447,950; sales −13.3%.");
    expect(figs.map((f) => f.value)).toEqual([447950, -13.3]);
    expect(figs[1].percent).toBe(true);
  });

  it("ignores years and small bare counts", () => {
    expect(extractFigures("sales in 2025 vs 2024 across 33 boroughs")).toEqual([]);
    expect(extractFigures("top 5 over 3 financial years")).toEqual([]);
  });

  it("negates distances phrased as below peak", () => {
    const figs = extractFigures("sitting 23.9% below its 10-year peak");
    expect(figs.map((f) => f.value)).toEqual([-23.9]);
  });
});

describe("verifyFigures", () => {
  it("verifies formatted figures against 4dp tool numbers", () => {
    const v = verifyFigures(["Average price £447,950; sales −13.3%."], TOOLS);
    expect(v.total).toBe(2);
    expect(v.verified).toBe(2);
    expect(v.unverified).toEqual([]);
  });

  it("catches an invented number", () => {
    const v = verifyFigures(["Average price £999,999 in Camden."], TOOLS);
    expect(v.total).toBe(1);
    expect(v.verified).toBe(0);
    expect(v.unverified[0].raw).toContain("999,999");
  });

  it("collects 4dp fractions without rounding to 2dp", () => {
    expect(collectToolNumbers(TOOLS)).toContain(-0.1327);
  });
});

describe("writeMemo (mock)", () => {
  it("returns a fully verified single-borough memo", async () => {
    const r = await writeMemo(["E09000007"]);
    expect(r.memo.evidence.length).toBeGreaterThan(0);
    expect(r.verification.total).toBeGreaterThan(0);
    expect(r.verification.verified).toBe(r.verification.total);
    expect(badgeText(r.verification)).toMatch(/✓ \d+\/\d+ figures verified/);
    expect(r.markdown).toContain("borough-level indicator");
    expect(r.markdown).toContain("calendar 2025");
  });

  it("returns a fully verified two-borough memo", async () => {
    const r = await writeMemo(["E09000007", "E09000030"]);
    expect(r.verification.verified).toBe(r.verification.total);
    expect(r.verification.total).toBeGreaterThan(0);
  });

  it("rejects unknown codes", async () => {
    await expect(writeMemo(["E99999999"])).rejects.toThrow(/unknown borough/);
  });
});

describe("memoToMarkdown", () => {
  it("links each figure to its source row", async () => {
    const r = await writeMemo(["E09000007"]);
    expect(r.markdown).toMatch(/\[source: E09000007 \w+\]/);
  });
});

describe("extractFigures dates", () => {
  it("ignores ISO year-months and dates, even before a comma", () => {
    expect(extractFigures("182 crimes over 2025-09 to 2026-08, at the 60th percentile").map((f) => f.raw)).toEqual([]);
    expect(extractFigures("as of 2026-09-30 the median was £535,000").map((f) => f.value)).toEqual([535000]);
  });
});
