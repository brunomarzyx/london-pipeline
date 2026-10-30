import { NextResponse } from "next/server";
import { getStreetsInBorough } from "@/lib/street";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lad = url.searchParams.get("lad") ?? "";
  if (!/^E09\d{6}$/.test(lad))
    return NextResponse.json({ error: "invalid borough code" }, { status: 400 });
  return NextResponse.json({ lad, streets: getStreetsInBorough(lad) });
}
