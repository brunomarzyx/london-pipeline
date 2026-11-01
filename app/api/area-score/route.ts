import { NextResponse } from "next/server";
import { getAreaScore, type Lens } from "@/lib/area-score";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const postcode = url.searchParams.get("postcode") ?? "";
  const lensParam = url.searchParams.get("lens");
  const lens: Lens = lensParam === "investor" ? "investor" : "buyer";
  const r = getAreaScore(postcode, lens);
  if (!r.postcode)
    return NextResponse.json({ error: "invalid postcode" }, { status: 400 });
  if (!r.located)
    return NextResponse.json(
      { error: "postcode not located", postcode: r.postcode },
      { status: 404 },
    );
  return NextResponse.json(r);
}
