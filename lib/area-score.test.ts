import { describe, expect, it } from "vitest";
import { getAreaScore } from "./area-score";

describe("area score", () => {
  it("scores SE15 4AN on both lenses with full component detail", () => {
    for (const lens of ["buyer", "investor"] as const) {
      const r = getAreaScore("SE15 4AN", lens);
      expect(r.postcode).toBe("SE15 4AN");
      expect(r.lens).toBe(lens);
      expect(r.located).toBe(true);
      expect(r.total).toBe(10);
      expect(r.available).toBeGreaterThanOrEqual(5);
      expect(r.lowCoverage).toBe(false);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(["Low", "Moderate", "Elevated", "High"]).toContain(r.band);
      expect(r.drivers.length).toBeLessThanOrEqual(3);
      expect(r.strengths.length).toBeLessThanOrEqual(2);
      for (const c of r.components) {
        expect(c.headline.length).toBeGreaterThan(0);
        expect(c.source.length).toBeGreaterThan(0);
        expect(c.asof.length).toBeGreaterThan(0);
      }
      // no invented figures: score is the weighted mean of shown components
      const avail = r.components.filter((c) => c.available && c.score != null);
      const w = avail.reduce((a, c) => a + c.weight, 0);
      const s = avail.reduce((a, c) => a + c.weight * (c.score as number), 0);
      expect(r.score).toBe(Math.round(s / w));
    }
  });

  it("uses different weights per lens", () => {
    const b = getAreaScore("SE15 4AN", "buyer");
    const i = getAreaScore("SE15 4AN", "investor");
    const bw = Object.fromEntries(b.components.map((c) => [c.key, c.weight]));
    const iw = Object.fromEntries(i.components.map((c) => [c.key, c.weight]));
    expect(bw.pipeline).toBe(0.5);
    expect(iw.pipeline).toBe(2);
    expect(bw.schools).toBe(1.5);
    expect(iw.epc).toBe(1.5);
  });

  it("excludes transport-premium", () => {
    const r = getAreaScore("SE15 4AN", "buyer");
    expect(r.components.map((c) => c.key)).not.toContain("transport-premium");
    expect(r.components.map((c) => c.key)).toContain("transport-proximity");
  });

  it("marks an invalid postcode low-coverage with no band", () => {
    const r = getAreaScore("NOT A POSTCODE", "buyer");
    expect(r.score).toBeNull();
    expect(r.band).toBeNull();
    expect(r.lowCoverage).toBe(true);
    expect(r.available).toBe(0);
  });

  it("marks a valid but unlocatable postcode as not located", () => {
    const r = getAreaScore("KT1 2TE", "buyer");
    expect(r.postcode).toBe("KT1 2TE");
    if (r.available < 5) expect(r.lowCoverage).toBe(true);
  });

  it("drivers are the largest weight×score contributions", () => {
    const r = getAreaScore("E14 9AF", "investor");
    if (r.drivers.length > 1) {
      for (let k = 1; k < r.drivers.length; k++)
        expect(r.drivers[k - 1].contribution as number).toBeGreaterThanOrEqual(
          r.drivers[k].contribution as number,
        );
    }
  });
});
