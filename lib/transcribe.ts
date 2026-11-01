import { promises as fs } from "node:fs";
import path from "node:path";
import OpenAI, { toFile } from "openai";

const BASE_URL = process.env.META_BASE_URL ?? "https://api.meta.ai/v1";
const MODEL = process.env.META_MODEL ?? "muse-spark-1.3";
const TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0";
const MOCK = process.env.MOCK_META === "1";

export async function transcribeAudio(data: Buffer, filename: string): Promise<string> {
  if (MOCK) {
    const raw = await fs.readFile(path.join(process.cwd(), "fixtures", "meta", "transcribe.json"), "utf8");
    return (JSON.parse(raw) as { text: string }).text;
  }
  const client = new OpenAI({
    baseURL: BASE_URL,
    apiKey: process.env.MODEL_API_KEY ?? "",
    fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  });
  const res = await client.audio.transcriptions.create({
    file: await toFile(data, filename),
    model: TRANSCRIBE_MODEL,
  });
  void MODEL;
  return res.text;
}
