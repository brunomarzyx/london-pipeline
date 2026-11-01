import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/transcribe";
import { limitResponse } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const limited = limitResponse(req, "model");
  if (limited) return limited;
  let file: File | null = null;
  try {
    file = (await req.formData()).get("audio") as File | null;
  } catch {
    return NextResponse.json({ error: "expected multipart audio" }, { status: 400 });
  }
  if (!file || file.size === 0 || file.size > 10_000_000)
    return NextResponse.json({ error: "audio file missing or over 10 MB" }, { status: 400 });
  try {
    const text = await transcribeAudio(Buffer.from(await file.arrayBuffer()), file.name || "ask.webm");
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "transcription failed" }, { status: 502 });
  }
}
