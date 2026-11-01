import { NextResponse } from "next/server";
import { z } from "zod";
import { askQuestion } from "@/lib/ask";
import { limitResponse } from "@/lib/ratelimit";

const Body = z.object({ question: z.string().min(1).max(500) });

export async function POST(req: Request) {
  const limited = limitResponse(req, "model");
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "question must be 1–500 chars" }, { status: 400 });
  const { answer, rounds, verification } = await askQuestion(parsed.data.question);
  return NextResponse.json({ answer, rounds, verification });
}
