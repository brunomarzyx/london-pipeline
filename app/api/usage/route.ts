import { NextResponse } from "next/server";
import { readUsageSummary } from "@/lib/usage";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readUsageSummary());
}
