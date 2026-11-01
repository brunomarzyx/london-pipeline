import { NextResponse } from "next/server";
import { z } from "zod";
import { runDiligence } from "@/lib/diligence";
import { limitResponse } from "@/lib/ratelimit";

const Image = z
  .string()
  .max(6_000_000)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);

const Body = z.object({
  text: z.string().min(1).max(20_000),
  image: Image.nullish(),
  postcode: z.string().max(10).nullish(),
  price: z.number().int().positive().max(100_000_000).nullish(),
  goal: z.enum(["buyer", "investor"]).nullish(),
});

export async function POST(req: Request) {
  const limited = limitResponse(req, "model");
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const r = await runDiligence({
    text: parsed.data.text,
    image: parsed.data.image ?? null,
    postcodeOverride: parsed.data.postcode ?? null,
    priceOverride: parsed.data.price ?? null,
    goal: parsed.data.goal ?? undefined,
  });
  return NextResponse.json(r);
}
