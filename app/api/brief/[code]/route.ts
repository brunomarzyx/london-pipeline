import { NextResponse } from "next/server";
import { briefForBorough, fallbackBrief } from "@/lib/brief";
import { getBoroughDetail } from "@/lib/db";
import { limitResponse } from "@/lib/ratelimit";

export async function GET(
  req: Request,
  { params }: { params: { code: string } },
) {
  // Over the cap: serve the deterministic brief rather than an error, so the UI keeps working.
  if (limitResponse(req, "brief")) {
    const d = getBoroughDetail(params.code);
    return NextResponse.json(fallbackBrief(d?.name ?? params.code, params.code), {
      headers: { "X-RateLimited": "1" },
    });
  }
  return NextResponse.json(await briefForBorough(params.code));
}
