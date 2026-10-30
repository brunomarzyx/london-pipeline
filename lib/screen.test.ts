import { describe, expect, it } from "vitest";
import { rankScreen, type ScreenRow } from "./screen";

const row = (o: Partial<ScreenRow>): ScreenRow => ({
  lsoa: "L", msoa: "M", postcode: "SE1 1AA", sector: "SE1 1", pairs: 200, name: "x", borough: "B", n: 20,
  ppsm: 5000, boroughPpsm: 6000, discount: -0.17, mom1y: 0.05, boroughMom1y: 0, edge: 0.05, mom5y: null, ...o,
});

describe("rankScreen", () => {
  it("drops rows failing discount, momentum edge, sample or pair thresholds", () => {
    const out = rankScreen([
      row({ lsoa: "ok" }),
      row({ lsoa: "dear", msoa: "M2", discount: -0.05 }),
      row({ lsoa: "flat", msoa: "M3", edge: 0 }),
      row({ lsoa: "thin", msoa: "M4", n: 9 }),
      row({ lsoa: "noisy", msoa: "M5", pairs: 149 }),
    ]);
    expect(out.map((r) => r.lsoa)).toEqual(["ok"]);
  });
  it("ranks by momentum edge, keeps one row per MSOA (deepest discount) and counts hits", () => {
    const out = rankScreen([
      row({ lsoa: "a1", msoa: "A", edge: 0.02, discount: -0.12 }),
      row({ lsoa: "b1", msoa: "B", edge: 0.08, discount: -0.11 }),
      row({ lsoa: "b2", msoa: "B", edge: 0.08, discount: -0.3 }),
    ]);
    expect(out.map((r) => [r.lsoa, r.hits])).toEqual([["b2", 2], ["a1", 1]]);
  });
});
