import { describe, expect, test } from "vitest";
import {
  changeOver,
  cityMetrics,
  classifyGlobalPhase,
  cpiMonthFor,
  distFromPeak,
  periodToMonthIndex,
  policyStats,
  stepBackPeriod,
  toReal,
  type GlobalCityDoc,
} from "./global";

const M = (months: number[], base = 100): { p: string; v: number }[] =>
  months.map((m, i) => ({
    p: `2025-${String(m).padStart(2, "0")}`,
    v: base + i,
  }));

describe("period helpers", () => {
  test("monthly and quarterly indices", () => {
    expect(periodToMonthIndex("2026-08")).toBe(2026 * 12 + 8);
    expect(periodToMonthIndex("2026-Q2")).toBe(2026 * 12 + 6);
  });
  test("stepBackPeriod crosses year boundary", () => {
    expect(stepBackPeriod("2026-08", 12, "M")).toBe("2025-08");
    expect(stepBackPeriod("2026-Q2", 4, "Q")).toBe("2025-Q2");
    expect(stepBackPeriod("2026-Q1", 1, "Q")).toBe("2025-Q4");
  });
  test("cpiMonthFor maps quarters to end months", () => {
    expect(cpiMonthFor("2026-Q1")).toBe("2026-03");
    expect(cpiMonthFor("2026-08")).toBe("2026-08");
  });
});

describe("toReal", () => {
  test("deflates and drops periods without CPI", () => {
    const real = toReal(
      [
        { p: "2025-01", v: 200 },
        { p: "2025-02", v: 210 },
      ],
      new Map([["2025-01", 100]]),
    );
    expect(real).toEqual([{ p: "2025-01", v: 200 }]);
  });
});

describe("changeOver", () => {
  test("percent change and null on gaps", () => {
    const s = [
      { p: "2025-08", v: 100 },
      { p: "2026-08", v: 110 },
    ];
    expect(changeOver(s, "2026-08", 12, "M")).toBeCloseTo(10, 9);
    expect(changeOver(s, "2026-08", 60, "M")).toBeNull();
  });
});

describe("distFromPeak", () => {
  test("negative when below peak, zero at peak", () => {
    const s = [
      { p: "2025-01", v: 100 },
      { p: "2025-02", v: 120 },
      { p: "2025-03", v: 90 },
    ];
    expect(distFromPeak(s, "2025-03", 120)).toBeCloseTo(-25, 9);
    expect(distFromPeak(s, "2025-02", 120)).toBeCloseTo(0, 9);
    expect(distFromPeak([], "2025-02", 120)).toBeNull();
  });
});

describe("policyStats", () => {
  test("latest and 12m change", () => {
    const p = [
      { p: "2025-08", v: 5 },
      { p: "2026-08", v: 4 },
    ];
    expect(policyStats(p)).toEqual({ latest: "2026-08", rate: 4, change12m: -1 });
    expect(policyStats([])).toEqual({ latest: null, rate: null, change12m: null });
  });
});

describe("classifyGlobalPhase", () => {
  test("four quadrants plus unknown", () => {
    expect(classifyGlobalPhase(2, -0.5)).toBe("expansion");
    expect(classifyGlobalPhase(2, 0.5)).toBe("cooling");
    expect(classifyGlobalPhase(-2, -0.5)).toBe("recovery");
    expect(classifyGlobalPhase(-2, 0.5)).toBe("correction");
    expect(classifyGlobalPhase(null, 0)).toBe("unknown");
    expect(classifyGlobalPhase(1, null)).toBe("unknown");
  });
  test("flat prices count as not-up; steady rates count as easing", () => {
    expect(classifyGlobalPhase(0, 0)).toBe("recovery");
    expect(classifyGlobalPhase(0.1, 0)).toBe("expansion");
  });
});

function doc(over: Partial<GlobalCityDoc> = {}): GlobalCityDoc {
  return {
    key: "test",
    city: "Testville",
    country: "Testland",
    country_code: "TT",
    rate_code: "TT",
    series: "M:TT:2:1:0:1:0:0",
    freq: "M",
    unit: "index",
    nominal: true,
    price: M([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).map((o) => [o.p, o.v] as [string, number]),
    cpi: M([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 100).map(
      (o) => [o.p, o.v] as [string, number],
    ),
    policy: [
      ["2024-12", 5],
      ["2025-12", 4],
    ],
    ...over,
  };
}

describe("cityMetrics", () => {
  test("computes phase from real momentum and rate direction", () => {
    const m = cityMetrics(doc());
    expect(m.latestPeriod).toBe("2025-12");
    expect(m.policyRate).toBe(4);
    expect(m.policyChange12m).toBe(-1);
    expect(m.real1y).toBeNull(); // only 12 obs, needs 13
    expect(m.phase).toBe("unknown");
  });
  test("full windows produce all metrics", () => {
    const months: [string, number][] = [];
    const cpi: [string, number][] = [];
    for (let i = 0; i < 130; i++) {
      const d = new Date(2015, 0 + i, 1);
      const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push([p, 100 + i]);
      cpi.push([p, 100]);
    }
    const pol: [string, number][] = months
      .filter((_, i) => i % 12 === 0)
      .map(([p]) => [p.slice(0, 7), 5]);
    const m = cityMetrics(doc({ price: months, cpi, policy: pol }));
    expect(m.real1y).not.toBeNull();
    expect(m.real5y).not.toBeNull();
    expect(m.distFromPeak).toBeCloseTo(0, 9);
    expect(m.phase).toBe("expansion");
    expect(m.spark.length).toBeLessThanOrEqual(40);
  });
});
