import { describe, expect, it } from "vitest";
import { getAllMetrics } from "./db";
import { askQuestion, extractJSON, renderSummary, runTool } from "./ask";

describe("ask tools", () => {
  it("rejects out-of-range rank args", () => {
    expect(runTool("rank_boroughs", { metric: "pressure", n: 99, order: "desc" }))
      .toMatch(/invalid args/);
  });

  it("returns null with a note for an unknown borough", () => {
    const res = JSON.parse(runTool("get_borough_metrics", { code: "E99999999" }));
    expect(res.metrics).toBeNull();
  });

  it("returns global city metrics for London", () => {
    const res = JSON.parse(runTool("get_city_metrics", { city: "London" }));
    expect(res.city).toBe("London");
    expect(typeof res.real1y).toBe("number");
    expect(typeof res.policyRate).toBe("number");
    expect(res.phase).toMatch(/expansion|cooling|correction|recovery|unknown/);
  });

  it("returns null with a note for an unknown city", () => {
    const res = JSON.parse(runTool("get_city_metrics", { city: "Atlantis" }));
    expect(res.metrics).toBeNull();
  });

  it("rank top-1 matches the best row in the DB", () => {
    const all = getAllMetrics().filter((b) => b.netBuildup != null);
    const best = all.sort((a, b) => b.netBuildup! - a.netBuildup!)[0];
    const top = JSON.parse(
      runTool("rank_boroughs", { metric: "netBuildup", n: 1, order: "desc" }),
    );
    expect(top[0].code).toBe(best.code);
  });
});

describe("ask loop (mock)", () => {
  it("answers with real numbers from tool results", async () => {
    const { answer } = await askQuestion("Which 5 boroughs have the biggest pipeline build-up?");
    const top = getAllMetrics()
      .filter((b) => b.netBuildup != null)
      .sort((a, b) => b.netBuildup! - a.netBuildup!)[0];
    expect(answer).toContain(top.name);
  });

  it("says approvals data is not in this build", async () => {
    const { answer } = await askQuestion("How many approvals were granted?");
    expect(answer).toMatch(/not in this build/i);
  });

  it("stops after 4 tool rounds and still answers", async () => {
    const { answer, rounds } = await askQuestion("loop test [loop]");
    expect(rounds).toBeLessThanOrEqual(5);
    expect(answer.length).toBeGreaterThan(0);
  });

  it("renderSummary marks missing data", () => {
    expect(renderSummary([])).toMatch(/missing/);
  });

  it("answers a fair-price question from street-level comps (verified)", async () => {
    const out = JSON.parse(
      runTool("get_area_comps", { postcode: "E14 9AF", type: "flat", price: 650000 }),
    );
    expect(out.level).toBe("street");
    expect(out.n).toBeGreaterThanOrEqual(10);
    expect(out.median).toBeGreaterThan(100000);
    const { answer, verification } = await askQuestion(
      "Is £650,000 fair for a flat in E14 9AF?",
    );
    expect(answer).toMatch(/762,500/);
    expect(verification.verified).toBe(verification.total);
  });

  it("extracts the JSON object from prose around it", () => {
    const v = extractJSON(
      'I\'ll rank them now. {"type": "final", "answer": "hi"} done.',
    ) as { type: string };
    expect(v.type).toBe("final");
  });
});
