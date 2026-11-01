import { NextResponse } from "next/server";
import { z } from "zod";
import { writeMemo } from "@/lib/memo";
import { limitResponse, dailyCapResponse } from "@/lib/ratelimit";

const Body = z.object({ codes: z.array(z.string().min(1).max(12)).min(1).max(2) });

export async function POST(req: Request) {
  const limited = limitResponse(req, "model");
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "codes must be 1–2 borough codes" }, { status: 400 });
  try {
    const r = await writeMemo(parsed.data.codes);
    return NextResponse.json({
      memo: r.memo,
      verification: r.verification,
      markdown: r.markdown,
    });
  } catch (e) {
    const cap = dailyCapResponse(e);
    if (cap) return cap;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "memo failed" },
      { status: 400 },
    );
  }
}
