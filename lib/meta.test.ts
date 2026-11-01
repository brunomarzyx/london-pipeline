import { describe, expect, it } from "vitest";
import { z } from "zod";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chat, chatJSON, assertUnderDailyCap, dailyTokenCap, tokensUsedToday, DailyCapError, DAILY_CAP_MESSAGE } from "./meta";

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

describe("daily token cap", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  async function logFile(lines: object[]): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "usage-"));
    const file = path.join(dir, "usage.jsonl");
    await fs.writeFile(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    return file;
  }

  it("sums only live tokens from today (UTC)", async () => {
    const file = await logFile([
      { ts: "2026-11-01T00:00:01Z", total_tokens: 700, mock: false },
      { ts: "2026-11-01T23:59:59Z", prompt_tokens: 200, completion_tokens: 100, mock: false },
      { ts: "2026-10-31T23:59:59Z", total_tokens: 9999, mock: false },
      { ts: "2026-11-01T10:00:00Z", total_tokens: 5000, mock: true },
    ]);
    expect(await tokensUsedToday(file, now)).toBe(1000);
  });

  it("refuses at or over the cap with a clear message, allows under it", async () => {
    const file = await logFile([{ ts: "2026-11-01T09:00:00Z", total_tokens: 1000, mock: false }]);
    await expect(assertUnderDailyCap({ file, cap: 1001, now })).resolves.toBeUndefined();
    await expect(assertUnderDailyCap({ file, cap: 1000, now })).rejects.toBeInstanceOf(DailyCapError);
    await expect(assertUnderDailyCap({ file, cap: 1000, now })).rejects.toThrow(DAILY_CAP_MESSAGE);
  });

  it("a missing log is zero usage; cap 0 disables; default is 200000", async () => {
    expect(await tokensUsedToday("/nonexistent/usage.jsonl", now)).toBe(0);
    const file = await logFile([{ ts: "2026-11-01T09:00:00Z", total_tokens: 10, mock: false }]);
    await expect(assertUnderDailyCap({ file, cap: 0, now })).resolves.toBeUndefined();
    expect(dailyTokenCap({})).toBe(200_000);
    expect(dailyTokenCap({ META_DAILY_TOKEN_CAP: "50" })).toBe(50);
    expect(dailyTokenCap({ META_DAILY_TOKEN_CAP: "abc" })).toBe(200_000);
  });
});
