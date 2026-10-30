import { NextResponse } from "next/server";
import { getAllMetrics } from "@/lib/db";

export function GET() {
  return NextResponse.json(getAllMetrics());
}
