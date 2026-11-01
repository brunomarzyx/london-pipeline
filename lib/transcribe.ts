import { promises as fs } from "node:fs";
import path from "node:path";

const BASE_URL = process.env.META_BASE_URL ?? "https://api.meta.ai/v1";
const TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0";
const MOCK = process.env.MOCK_META === "1";

/**
 * Batch speech-to-text via Meta's ASR endpoint (POST /asr/transcribe, multipart: `request` JSON + `audio` WAV).
 * Audio must be RIFF/WAVE mono 16-bit PCM at 16 or 24 kHz; the mic button converts in the browser.
 */
export async function transcribeAudio(data: Buffer, filename: string): Promise<string> {
  if (MOCK) {
    const raw = await fs.readFile(path.join(process.cwd(), "fixtures", "meta", "transcribe.json"), "utf8");
    return (JSON.parse(raw) as { text: string }).text;
  }
  const fd = new FormData();
  fd.append(
    "request",
    new Blob([JSON.stringify({ mode: "PUSH_TO_TALK", model: TRANSCRIBE_MODEL, audioEncoding: "WAV" })], { type: "application/json" }),
  );
  fd.append("audio", new Blob([new Uint8Array(data)], { type: "audio/wav" }), filename.replace(/\.[^.]+$/, "") + ".wav");
  const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/asr/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY ?? ""}`, Accept: "application/json" },
    body: fd,
  });
  if (!res.ok) throw new Error(`transcribe ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { transcript?: string };
  return (j.transcript ?? "").trim();
}
