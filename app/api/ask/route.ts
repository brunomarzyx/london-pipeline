import { NextResponse } from "next/server";
import { z } from "zod";
import { askQuestion } from "@/lib/ask";
import { cacheLabel, readCache, wantsLive } from "@/lib/demo-cache";
import { limitResponse, dailyCapResponse } from "@/lib/ratelimit";

const Body = z.object({ question: z.string().min(1).max(500) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "question must be 1–500 chars" }, { status: 400 });
  if (!wantsLive(req)) {
    const hit = await readCache<Awaited<ReturnType<typeof askQuestion>>>("ask", {
      question: parsed.data.question,
    });
    if (hit) return NextResponse.json({ ...hit.result, cached: cacheLabel(hit) });
  }
  const limited = limitResponse(req, "model");
  if (limited) return limited;
  try {
    const { answer, rounds, verification } = await askQuestion(parsed.data.question);
    return NextResponse.json({ answer, rounds, verification });
  } catch (e) {
    const cap = dailyCapResponse(e);
    if (cap) return cap;
    throw e;
  }
}
