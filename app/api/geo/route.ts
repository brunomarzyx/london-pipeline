import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function GET() {
  const raw = await fs.readFile(
    path.join(process.cwd(), "data", "boroughs.geojson"),
    "utf8",
  );
  return new NextResponse(raw, {
    headers: { "content-type": "application/json" },
  });
}
