import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_INPUTS, DEMO_LISTING, readCache, writeCache, wantsLive } from "./demo-cache";
import { formatCacheLabel } from "./cache-label";

let dir: string;
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "demo-cache-"));
  process.env.DEMO_CACHE_DIR = dir;
});
afterAll(() => {
  delete process.env.DEMO_CACHE_DIR;
});

describe("demo cache", () => {
  it("serves only exact (whitespace-normalised) demo inputs", async () => {
    const ask = DEMO_INPUTS.find((d) => d.id === "ask-se15")!;
    expect(await readCache("ask", ask.input)).toBeNull();
    await writeCache(ask.id, "ask", ask.input, { answer: "x" }, true);
    const hit = await readCache<{ answer: string }>("ask", {
      question: "  Is £650k fair for a 70 sq m flat   at SE15 4AN? ",
    });
    expect(hit?.result.answer).toBe("x");
    expect(hit?.mock).toBe(true);
    expect(await readCache("ask", { question: "Is £660k fair for a 70 sq m flat at SE15 4AN?" })).toBeNull();
  });

  it("keys diligence on goal and overrides", async () => {
    const d = DEMO_INPUTS.find((x) => x.id === "diligence-se15-buyer")!;
    await writeCache(d.id, "diligence", d.input, { steps: [] }, false);
    expect(await readCache("diligence", { text: DEMO_LISTING, goal: "buyer" })).not.toBeNull();
    expect(await readCache("diligence", { text: DEMO_LISTING, goal: "investor" })).toBeNull();
    expect(await readCache("diligence", { text: DEMO_LISTING, goal: "buyer", price: 600000 })).toBeNull();
  });

  it("detects ?live=1 and labels the date honestly", () => {
    expect(wantsLive(new Request("http://x/api/ask?live=1"))).toBe(true);
    expect(wantsLive(new Request("http://x/api/ask"))).toBe(false);
    expect(formatCacheLabel({ at: "2026-11-01T10:00:00Z", mock: false })).toBe("cached run · 1 Nov 2026");
    expect(formatCacheLabel({ at: "2026-11-01T10:00:00Z", mock: true })).toContain("mock fixtures");
  });
});

describe("diligence stream route", () => {
  const post = async (url: string, body: object) => {
    const { POST } = await import("../app/api/diligence/route");
    const res = await POST(
      new Request(url, { method: "POST", body: JSON.stringify({ ...body, stream: true }) }),
    );
    const text = await res.text();
    return [...text.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);
  };

  it("replays cached steps then done", async () => {
    const d = DEMO_INPUTS.find((x) => x.id === "diligence-se15-buyer")!;
    const step = { name: "get_area_comps", args: {}, result: "{}", ms: 1 };
    await writeCache(d.id, "diligence", d.input, { steps: [step, step], verdict: {} }, false);
    const t0 = Date.now();
    const events = await post("http://x/api/diligence", { text: DEMO_LISTING, goal: "buyer" });
    expect(events).toEqual(["step", "step", "done"]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(400);
  });

  it("streams live (mock) steps as they happen with ?live=1", async () => {
    const events = await post("http://x/api/diligence?live=1", { text: DEMO_LISTING, goal: "buyer" });
    expect(events.filter((e) => e === "start").length).toBeGreaterThan(0);
    expect(events.filter((e) => e === "step").length).toBe(events.filter((e) => e === "start").length);
    expect(events.at(-1)).toBe("done");
  });
});
