import { NextResponse } from "next/server";
import { briefForBorough } from "@/lib/brief";

export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
) {
  return NextResponse.json(await briefForBorough(params.code));
}
