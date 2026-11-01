import { describe, expect, it } from "vitest";
import { transcribeAudio } from "./transcribe";

describe("transcribe (mock)", () => {
  it("returns the fixture text without calling the API", async () => {
    const text = await transcribeAudio(Buffer.from([0, 1, 2]), "ask.webm");
    expect(text).toMatch(/Copleston Road/);
  });
});
