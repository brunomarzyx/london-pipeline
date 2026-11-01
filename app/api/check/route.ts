import { NextResponse } from "next/server";
import { z } from "zod";
import { checkListing, extractListing } from "@/lib/listing";
import { cacheLabel, readCache, wantsLive } from "@/lib/demo-cache";
import { limitResponse, dailyCapResponse } from "@/lib/ratelimit";

const Image = z
  .string()
  .max(6_000_000)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("extract"),
    text: z.string().min(1).max(20_000),
    image: Image.nullish(),
  }),
  z.object({
    action: z.literal("verdict"),
    fields: z.object({
      price: z.number().positive().max(100_000_000).nullable(),
      sqm: z.number().positive().max(1000).nullable(),
      postcode: z.string().max(12).nullable(),
      type: z.enum(["flat", "house"]).nullable(),
      bedrooms: z.number().int().min(0).max(20).nullable(),
    }),
  }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  if (parsed.data.action === "extract") {
    if (!parsed.data.image && !wantsLive(req)) {
      const hit = await readCache<Awaited<ReturnType<typeof extractListing>>>("check", {
        text: parsed.data.text,
      });
      if (hit) return NextResponse.json({ ...hit.result, cached: cacheLabel(hit) });
    }
    const limited = limitResponse(req, "model");
    if (limited) return limited;
    try {
      return NextResponse.json(
        await extractListing(parsed.data.text, { image: parsed.data.image ?? null }),
      );
    } catch (e) {
      const cap = dailyCapResponse(e);
      if (cap) return cap;
      throw e;
    }
  }
  return NextResponse.json(checkListing(parsed.data.fields));
}
