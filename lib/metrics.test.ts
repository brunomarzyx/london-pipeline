import { describe, expect, it } from "vitest";
import {
  netPipelineBuildup,
  priceChange12m,
  startsMomentum,
  supplyPressureRatio,
} from "./metrics";

describe("priceChange12m", () => {
  it("computes percent change", () => {
    expect(priceChange12m(550000, 500000)).toBeCloseTo(10);
  });
  it("returns null when either value is null", () => {
    expect(priceChange12m(null, 500000)).toBeNull();
    expect(priceChange12m(550000, null)).toBeNull();
  });
  it("returns null when the base is zero", () => {
    expect(priceChange12m(550000, 0)).toBeNull();
  });
});

describe("netPipelineBuildup", () => {
  it("is starts minus completions", () => {
    expect(netPipelineBuildup(3000, 2000)).toBe(1000);
  });
  it("returns null when either total is null", () => {
    expect(netPipelineBuildup(null, 2000)).toBeNull();
    expect(netPipelineBuildup(3000, null)).toBeNull();
  });
});

describe("supplyPressureRatio", () => {
  it("divides net build-up by average annual completions", () => {
    expect(supplyPressureRatio(3000, 1000)).toBeCloseTo(3);
  });
  it("returns null (not Infinity) when completions are zero", () => {
    expect(supplyPressureRatio(3000, 0)).toBeNull();
  });
  it("returns null when either value is null", () => {
    expect(supplyPressureRatio(null, 1000)).toBeNull();
    expect(supplyPressureRatio(3000, null)).toBeNull();
  });
});

describe("startsMomentum", () => {
  it("is latest 4Q over prior 4Q minus one", () => {
    expect(startsMomentum(1200, 1000)).toBeCloseTo(0.2);
  });
  it("returns null when the prior period is zero", () => {
    expect(startsMomentum(1200, 0)).toBeNull();
  });
  it("returns null when the prior base is too small to be meaningful", () => {
    expect(startsMomentum(1530, 30)).toBeNull();
    expect(startsMomentum(150, 100)).toBeCloseTo(0.5);
  });
  it("returns null when either value is null", () => {
    expect(startsMomentum(null, 1000)).toBeNull();
    expect(startsMomentum(1200, null)).toBeNull();
  });
});
