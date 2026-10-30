import { describe, expect, it } from "vitest";
import {
  PRESSURE_HIGH,
  PRESSURE_LOW,
  classifyCycle,
  explainCyclePhase,
  fallbackCycleParagraph,
  fmtPct,
  fmtPressure,
  fmtPrice,
} from "./cycle";

describe("classifyCycle", () => {
  it("is expansion when prices rise with moderate pressure", () => {
    expect(classifyCycle(2.5, 0.6, 0.1)).toBe("expansion");
  });

  it("is recovery when prices rise with a drained pipeline", () => {
    expect(classifyCycle(2.5, PRESSURE_LOW - 0.1, 0.1)).toBe("recovery");
  });

  it("is hypersupply when pressure is high even as prices rise", () => {
    expect(classifyCycle(1.0, PRESSURE_HIGH + 0.5, 0.2)).toBe("hypersupply");
  });

  it("is hypersupply when pressure is high and prices fall", () => {
    expect(classifyCycle(-2.0, 1.5, -0.1)).toBe("hypersupply");
  });

  it("is recession when prices fall with low pressure", () => {
    expect(classifyCycle(-3.0, 0.4, -0.2)).toBe("recession");
  });

  it("tolerates null momentum from small starts bases", () => {
    expect(classifyCycle(2.5, 0.1, null)).toBe("recovery");
    expect(classifyCycle(-3.0, 0.4, null)).toBe("recession");
    expect(classifyCycle(1.0, 2.0, null)).toBe("hypersupply");
  });

  it("is unknown when price change or pressure is missing", () => {
    expect(classifyCycle(null, 1.0, 0.1)).toBe("unknown");
    expect(classifyCycle(2.5, null, 0.1)).toBe("unknown");
    expect(classifyCycle(null, null, null)).toBe("unknown");
  });

  it("treats exact thresholds as the higher phase", () => {
    expect(classifyCycle(0, PRESSURE_LOW - 0.01, null)).toBe("recovery");
    expect(classifyCycle(2.0, PRESSURE_HIGH, null)).toBe("hypersupply");
  });
});

describe("formatters", () => {
  it("formats prices, percents, pressure and nulls for readers", () => {
    expect(fmtPrice(447950)).toBe("£447,950");
    expect(fmtPct(-13.25)).toBe("−13.3%");
    expect(fmtPressure(-0.93)).toBe("−0.93×");
    expect(fmtPrice(null)).toBe("no data");
    expect(fmtPct(null)).toBe("no data");
  });
});

describe("explainCyclePhase (mock)", () => {
  it("returns a non-empty paragraph for a real borough", async () => {
    const text = await explainCyclePhase("E09000030");
    expect(text.length).toBeGreaterThan(20);
  });

  it("falls back without inventing figures for an unknown borough", async () => {
    const text = await explainCyclePhase("E99999999");
    expect(text).toContain("E99999999");
  });

  it("fallback names the phase and formats the numbers", () => {
    const text = fallbackCycleParagraph("Camden", "recession", -13.25, 0.4);
    expect(text).toContain("recession");
    expect(text).toContain("−13.3%");
  });
});
