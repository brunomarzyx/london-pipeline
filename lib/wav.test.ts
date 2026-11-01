import { describe, it, expect } from "vitest";
import { encodeWav, isWav } from "./wav";

describe("wav", () => {
  it("encodes a mono PCM16 RIFF header at the given rate", () => {
    const buf = encodeWav(new Float32Array([0, 0.5, -1, 1]), 16000);
    const v = new DataView(buf);
    expect(isWav(new Uint8Array(buf))).toBe(true);
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16); // bits
    expect(v.getUint32(40, true)).toBe(8); // 4 samples × 2 bytes
    expect(v.getInt16(48, true)).toBe(-32768);
  });
  it("rejects non-WAV bytes", () => {
    expect(isWav(new TextEncoder().encode("\x1aE\xdf\xa3webm-ish-bytes"))).toBe(false);
  });
});
