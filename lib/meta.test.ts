import { describe, expect, it } from "vitest";
import { z } from "zod";
import { chat, chatJSON } from "./meta";

describe("meta wrapper (mock)", () => {
  it("chat returns the mock reply", async () => {
    const { reply } = await chat("reply with the word ok");
    expect(reply).toBe("ok");
  });

  it("usage record carries an ISO timestamp", async () => {
    const { usage } = await chat("reply with the word ok");
    expect(usage.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("chatJSON validates the fixture against the schema", async () => {
    const data = await chatJSON(
      "borough brief",
      z.object({ headline: z.string() }),
      { fixture: "chat-json" },
    );
    expect(data.headline).toBe("Mock borough brief");
  });
});
