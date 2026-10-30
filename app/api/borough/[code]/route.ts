import { NextResponse } from "next/server";
import { getBoroughDetail } from "@/lib/db";

export function GET(
  _req: Request,
  { params }: { params: { code: string } },
) {
  const detail = getBoroughDetail(params.code);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(detail);
}
