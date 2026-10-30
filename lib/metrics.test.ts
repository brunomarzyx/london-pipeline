import { describe, expect, it } from "vitest";
import {
  grossYield,
  netPipelineBuildup,
  newBuildShare,
  priceChange12m,
  priceToRent,
  rentChange12m,
  salesVolumeChange12m,
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

describe("grossYield", () => {
  it("is 12 x monthly rent over price, in percent", () => {
    expect(grossYield(2000, 600000)).toBeCloseTo(4);
  });
  it("returns null when either value is null or price is zero", () => {
    expect(grossYield(null, 600000)).toBeNull();
    expect(grossYield(2000, null)).toBeNull();
    expect(grossYield(2000, 0)).toBeNull();
  });
});

describe("priceToRent", () => {
  it("is price over annualised rent", () => {
    expect(priceToRent(600000, 2000)).toBeCloseTo(25);
  });
  it("returns null when either value is null or rent is zero", () => {
    expect(priceToRent(null, 2000)).toBeNull();
    expect(priceToRent(600000, null)).toBeNull();
    expect(priceToRent(600000, 0)).toBeNull();
  });
});

describe("rentChange12m", () => {
  it("computes percent change", () => {
    expect(rentChange12m(2200, 2000)).toBeCloseTo(10);
  });
  it("returns null when either value is null or the base is zero", () => {
    expect(rentChange12m(null, 2000)).toBeNull();
    expect(rentChange12m(2200, null)).toBeNull();
    expect(rentChange12m(2200, 0)).toBeNull();
  });
});

describe("salesVolumeChange12m", () => {
  it("is latest over prior minus one", () => {
    expect(salesVolumeChange12m(1100, 1000)).toBeCloseTo(0.1);
  });
  it("returns null when either value is null or the prior is zero", () => {
    expect(salesVolumeChange12m(null, 1000)).toBeNull();
    expect(salesVolumeChange12m(1100, null)).toBeNull();
    expect(salesVolumeChange12m(1100, 0)).toBeNull();
  });
});

describe("newBuildShare", () => {
  it("is new-build sales over total sales", () => {
    expect(newBuildShare(150, 1000)).toBeCloseTo(0.15);
  });
  it("returns null when either value is null or there were no sales", () => {
    expect(newBuildShare(null, 1000)).toBeNull();
    expect(newBuildShare(150, null)).toBeNull();
    expect(newBuildShare(0, 0)).toBeNull();
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
