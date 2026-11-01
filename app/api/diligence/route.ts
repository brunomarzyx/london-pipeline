import { NextResponse } from "next/server";
import { z } from "zod";
import { runDiligence, type DiligenceResult } from "@/lib/diligence";
import { cacheLabel, readCache, wantsLive } from "@/lib/demo-cache";
import { limitResponse, dailyCapResponse } from "@/lib/ratelimit";
import { DAILY_CAP_MESSAGE, DailyCapError } from "@/lib/meta";

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
  /** true: respond as server-sent events (step, done, error). */
  stream: z.boolean().nullish(),
});

const REPLAY_MS = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST /api/diligence[?live=1]
 * - stream:false/absent -> JSON DiligenceResult (unchanged).
 * - stream:true -> text/event-stream; events: thinking, start, step, done {result, cached?}, error {error, code?}.
 * Exact demo inputs are served from data/demo-cache unless ?live=1 (no model call, no rate limit).
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const b = parsed.data;
  const input = {
    text: b.text,
    image: b.image ?? null,
    postcodeOverride: b.postcode ?? null,
    priceOverride: b.price ?? null,
    goal: b.goal ?? undefined,
  };

  const hit =
    !b.image && !wantsLive(req)
      ? await readCache<DiligenceResult>("diligence", {
          text: b.text,
          postcode: b.postcode,
          price: b.price,
          goal: b.goal ?? "buyer",
        })
      : null;

  if (!hit) {
    const limited = limitResponse(req, "model");
    if (limited) return limited;
  }

  if (!b.stream) {
    if (hit) return NextResponse.json({ ...hit.result, cached: cacheLabel(hit) });
    try {
      return NextResponse.json(await runDiligence(input));
    } catch (e) {
      const cap = dailyCapResponse(e);
      if (cap) return cap;
      throw e;
    }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        if (hit) {
          for (const step of hit.result.steps) {
            await sleep(REPLAY_MS);
            send("step", { step });
          }
          await sleep(REPLAY_MS);
          send("done", { result: hit.result, cached: cacheLabel(hit) });
        } else {
          const result = await runDiligence({
            ...input,
            onEvent: (e) => send(e.type, e),
          });
          send("done", { result });
        }
      } catch (e) {
        if (e instanceof DailyCapError) send("error", { error: DAILY_CAP_MESSAGE, code: "daily_cap" });
        else send("error", { error: "Could not run diligence. Try again." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
