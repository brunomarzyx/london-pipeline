import { NextResponse } from "next/server";
import { getAreaComps, getStreetDb } from "@/lib/street";
import { STREET_UNAVAILABLE_MESSAGE } from "@/app/street-unavailable";

export async function GET(req: Request) {
  if (!getStreetDb())
    return NextResponse.json({ error: STREET_UNAVAILABLE_MESSAGE }, { status: 503 });
  const url = new URL(req.url);
  const postcode = url.searchParams.get("postcode") ?? "";
  const typeParam = url.searchParams.get("type");
  const type =
    typeParam === "flat" || typeParam === "house" ? typeParam : undefined;
  const sqmRaw = Number(url.searchParams.get("sqm"));
  const sqm = Number.isFinite(sqmRaw) && sqmRaw > 0 ? sqmRaw : null;
  const r = getAreaComps(postcode, type, sqm);
  if ("error" in r) {
    if (r.error === "invalid")
      return NextResponse.json(
        { error: "invalid postcode" },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "postcode not found in London" },
      { status: 404 },
    );
  }
  return NextResponse.json(r);
}
