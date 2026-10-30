import { NextResponse } from "next/server";
import { listCityMetrics } from "@/lib/global-data";

export function GET() {
  return NextResponse.json({ cities: listCityMetrics() });
}
