import { describe, expect, it } from "vitest";
import { BriefSchema, briefForBorough, enforceConfidence, fallbackBrief } from "./brief";

describe("brief (mock)", () => {
  it("returns a schema-valid brief for a real borough", async () => {
    const b = await briefForBorough("E09000030");
    expect(BriefSchema.safeParse(b).success).toBe(true);
  });

  it("falls back gracefully for an unknown borough", async () => {
    const b = await briefForBorough("E99999999");
    expect(b.confidence).toBe("low");
    expect(BriefSchema.safeParse(b).success).toBe(true);
  });

  it("sets medium with one core metric missing, low with two", () => {
    const ok = fallbackBrief("X", "E09000001");
    const one = enforceConfidence(
      { ...ok, confidence: "high" },
      { priceChange: 1.5, netBuildup: null, pressure: 2, momentum: 0.1, latestPrice: 500000 },
    );
    expect(one.confidence).toBe("medium");
    const two = enforceConfidence(
      { ...ok, confidence: "high" },
      { priceChange: null, netBuildup: null, pressure: 2, momentum: 0.1, latestPrice: 500000 },
    );
    expect(two.confidence).toBe("low");
  });

  it("does not lower confidence for a null momentum alone", () => {
    const ok = fallbackBrief("X", "E09000001");
    const kept = enforceConfidence(
      { ...ok, confidence: "high" },
      { priceChange: 1.5, netBuildup: 10, pressure: 2, momentum: null, latestPrice: 500000 },
    );
    expect(kept.confidence).toBe("high");
  });

  it("keeps model confidence when nothing is null", () => {
    const ok = fallbackBrief("X", "E09000001");
    const kept = enforceConfidence(
      { ...ok, confidence: "high" },
      { priceChange: 1.5, netBuildup: 10, pressure: 2, momentum: 0.1, latestPrice: 500000 },
    );
    expect(kept.confidence).toBe("high");
  });
});
