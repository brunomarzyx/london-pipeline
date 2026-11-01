import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { chat } from "./meta";
import { extractJSON, runTool } from "./ask";
import { extractListing } from "./listing";
import { getAreaContext, getStreetDb, normalisePostcode } from "./street";

export const MAX_DILIGENCE_ROUNDS = 8;

export const VerdictSchema = z.object({
  verdict: z.enum(["looks fair", "looks expensive", "looks cheap", "not enough data"]),
  headline: z.string().min(1).max(500),
  price_check: z.string().min(1).max(800),
  risks: z.array(z.string().min(1).max(400)).min(1).max(6).transform((a) => a.slice(0, 3)),
  strengths: z.array(z.string().min(1).max(400)).min(1).max(6).transform((a) => a.slice(0, 2)),
  questions_to_ask_agent: z.array(z.string().min(1).max(400)).min(1).max(6).transform((a) => a.slice(0, 3)),
  sources: z.array(z.string().min(1).max(300)).min(1).max(8).transform((a) => a.slice(0, 5)),
});
export type DiligenceVerdict = z.infer<typeof VerdictSchema>;

const ToolCallSchema = z.object({
  type: z.literal("tool_call"),
  name: z.enum([
    "extract_listing",
    "get_area_comps",
    "get_area_risk",
    "get_borough_metrics",
    "get_neighbourhood",
  ]),
  args: z.unknown(),
});

const FinalSchema = z.object({ type: z.literal("final"), verdict: VerdictSchema });

/** One live call asking for the final verdict JSON on a (possibly slimmed) transcript. */
export async function completeFinalVerdict(
  transcriptText: string,
  system: string,
  fixture?: string,
): Promise<DiligenceVerdict | null> {
  const { reply } = await chat(transcriptText, {
    system,
    effort: "medium",
    maxTokens: 8192,
    ...(fixture ? { fixture } : {}),
  });
  const parsed = FinalSchema.safeParse(extractJSON(reply));
  return parsed.success ? parsed.data.verdict : null;
}

export interface DiligenceStep {
  name: string;
  args: unknown;
  result: string;
  ms: number;
}

/** Progress events for streaming the step trace. */
export type DiligenceEvent =
  | { type: "thinking"; round: number }
  | { type: "start"; name: string; args: unknown }
  | { type: "step"; step: DiligenceStep };

export interface DiligenceInput {
  onEvent?: (e: DiligenceEvent) => void;
  text: string;
  image?: string | null;
  postcodeOverride?: string | null;
  priceOverride?: number | null;
  goal?: "buyer" | "investor";
}

function postcodeToLad(postcode: string): string | null {
  const pc = normalisePostcode(postcode);
  if (!pc) return null;
  try {
    const row = getStreetDb()
      ?.prepare("SELECT lad FROM postcodes WHERE postcode=?")
      .get(pc) as { lad: string } | undefined;
    return row?.lad ?? null;
  } catch {
    return null;
  }
}

function postcodeToLsoa(postcode: string): string | null {
  const pc = normalisePostcode(postcode);
  if (!pc) return null;
  try {
    const row = getStreetDb()
      ?.prepare("SELECT lsoa FROM postcodes WHERE postcode=?")
      .get(pc) as { lsoa: string } | undefined;
    return row?.lsoa ?? null;
  } catch {
    return null;
  }
}

const BoroughByPostcodeArgs = z.object({
  postcode: z.string().min(1).max(10),
  code: z.string().min(1).max(12).optional(),
});

export function runDiligenceTool(
  name: string,
  args: unknown,
  ctx: { text: string; image?: string | null; mockRound?: string },
): string {
  if (name === "extract_listing") {
    // Synchronous wrapper: the mock path is synchronous in tests via fixture read below.
    // Real path is async and handled by runDiligence; this throws to signal async needed.
    throw new Error("extract_listing needs async context");
  }
  if (name === "get_area_comps") return runTool("get_area_comps", args);
  if (name === "get_area_risk") return runTool("get_area_risk", args);
  if (name === "get_borough_metrics") {
    const parsed = BoroughByPostcodeArgs.safeParse(args ?? {});
    if (parsed.success && !parsed.data.code && parsed.data.postcode) {
      const lad = postcodeToLad(parsed.data.postcode);
      if (!lad)
        return JSON.stringify({
          postcode: parsed.data.postcode,
          metrics: null,
          note: "postcode not located",
        });
      return runTool("get_borough_metrics", { code: lad });
    }
    return runTool("get_borough_metrics", args);
  }
  if (name === "get_neighbourhood") {
    const parsed = z.object({ postcode: z.string().min(1).max(10) }).safeParse(args ?? {});
    if (!parsed.success) return `error: invalid args (${parsed.error.message})`;
    const lsoa = postcodeToLsoa(parsed.data.postcode);
    if (!lsoa)
      return JSON.stringify({ postcode: parsed.data.postcode, context: null, note: "not located" });
    return JSON.stringify({ postcode: normalisePostcode(parsed.data.postcode), context: getAreaContext(lsoa) });
  }
  void ctx;
  return `error: unknown tool "${name}"`;
}

function mockFixtureFor(history: { name: string }[]): string {
  const names = history.map((h) => h.name);
  if (!names.includes("extract_listing")) return "diligence-extract";
  if (!names.includes("get_area_comps")) return "diligence-comps";
  if (!names.includes("get_area_risk")) return "diligence-risk";
  return "diligence-final";
}

function verdictTexts(v: DiligenceVerdict): string[] {
  return [v.headline, v.price_check, ...v.risks, ...v.strengths, ...v.questions_to_ask_agent];
}

export interface DiligenceResult {
  verdict: DiligenceVerdict;
  steps: DiligenceStep[];
  rounds: number;
  verification: { total: number; verified: number };
  repaired: boolean;
}

export async function runDiligence(input: DiligenceInput): Promise<DiligenceResult> {
  const system = await fs.readFile(path.join(process.cwd(), "prompts", "diligence.md"), "utf8");
  const mock = process.env.MOCK_META === "1";
  const lens = input.goal === "investor" ? "investor" : "buyer";
  const history: { name: string; result: string }[] = [];
  const steps: DiligenceStep[] = [];

  if (input.postcodeOverride && normalisePostcode(input.postcodeOverride)) {
    const pc = normalisePostcode(input.postcodeOverride)!;
    history.push({
      name: "override",
      result: JSON.stringify({
        postcode: pc,
        price: input.priceOverride ?? null,
        note: "user-supplied override, treated as given",
      }),
    });
  }

  const contextBlock = [
    `Listing text:\n"""\n${input.text}\n"""`,
    input.image ? "A floorplan image was attached with the listing." : null,
    input.postcodeOverride ? `User postcode override: ${input.postcodeOverride}` : null,
    input.priceOverride != null ? `User price override: ${input.priceOverride}` : null,
    `User goal: ${lens} (use this lens for get_area_risk unless the listing says otherwise)`,
  ]
    .filter(Boolean)
    .join("\n");

  /** Slimmed for the model (headroom for the verdict); full text stays in history for the verifier. */
  const slim = (s: string): string =>
    s.length > 1500 ? `${s.slice(0, 1500)}\n…(truncated for brevity; full output retained)` : s;
  const transcript = (extra?: string) =>
    [contextBlock]
      .concat(
        history.map((h) => `Tool ${h.name} returned: ${slim(h.result)}`),
        extra ? [extra] : [],
      )
      .join("\n");

  async function execTool(name: string, args: unknown): Promise<string> {
    if (name === "extract_listing") {
      const e = await extractListing(input.text, {
        image: input.image ?? null,
        fixture: mock ? "listing" : undefined,
      });
      return JSON.stringify({ fields: e.fields, warnings: e.warnings });
    }
    return runDiligenceTool(name, args, { text: input.text, image: input.image ?? null });
  }

  let rounds = 0;
  for (let round = 0; round < MAX_DILIGENCE_ROUNDS; round++) {
    rounds = round + 1;
    input.onEvent?.({ type: "thinking", round: rounds });
    const fixture = mock ? mockFixtureFor(history) : undefined;
    const { reply } = await chat(transcript(), {
      system,
      effort: "medium",
      maxTokens: 8192,
      ...(fixture ? { fixture } : {}),
    });
    const parsed = z.union([ToolCallSchema, FinalSchema]).safeParse(extractJSON(reply));
    if (!parsed.success) {
      history.push({
        name: "parse_error",
        result: "error: reply was not a valid tool_call/final object; answer with what you have",
      });
      continue;
    }
    if (parsed.data.type === "final") {
      return await finish(parsed.data.verdict, false);
    }
    input.onEvent?.({ type: "start", name: parsed.data.name, args: parsed.data.args });
    const t0 = Date.now();
    let result: string;
    try {
      result = await execTool(parsed.data.name, parsed.data.args);
    } catch (e) {
      result = `error: ${(e as Error).message}`;
    }
    const step = { name: parsed.data.name, args: parsed.data.args, result, ms: Date.now() - t0 };
    steps.push(step);
    input.onEvent?.({ type: "step", step });
    history.push({ name: step.name, result: step.result });
  }

  // Round cap: force a final verdict.
  const forced = await completeFinalVerdict(
    transcript("No more tool calls. Reply with {\"type\":\"final\",\"verdict\":{...}} using only the numbers above; if data is missing use verdict \"not enough data\"."),
    system,
    mock ? "diligence-final" : undefined,
  );
  if (forced) return await finish(forced, false);
  return await finish(
    {
      verdict: "not enough data",
      headline: "The available data was not enough for a verdict.",
      price_check: "Tool results did not include usable comparables for this listing.",
      risks: ["No comparables found.", "Area risk not assessed.", "Borough context missing."],
      strengths: ["No strengths established.", "See the linked area page for raw figures."],
      questions_to_ask_agent: [
        "What is the full postcode?",
        "What is the floor area in sq m?",
        "Is it a flat or a house?",
      ],
      sources: ["diligence tool trace"],
    },
    false,
  );

  async function finish(v: DiligenceVerdict, repaired: boolean): Promise<DiligenceResult> {
    const { verifyFigures } = await import("./memo");
    const toolResults = history.map((h) => h.result);
    const check = verifyFigures(verdictTexts(v), toolResults);
    if (check.total > 0 && check.verified < check.total && !repaired) {
      // One repair round: ask the model to fix the numbers.
      const bad = check.unverified.map((u) => u.raw).join(", ");
      const rp = await completeFinalVerdict(
        transcript(
          `The verdict used figures not present in any tool output (${bad}). Rewrite the verdict using only numbers copied exactly from the tool outputs above, keeping the same schema.`,
        ),
        system,
        mock ? "diligence-final" : undefined,
      );
      if (rp) {
        const c2 = verifyFigures(verdictTexts(rp), toolResults);
        if (c2.total === 0 || c2.verified === c2.total)
          return { verdict: rp, steps, rounds: rounds + 1, verification: c2, repaired: true };
      }
      return {
        verdict: {
          verdict: "not enough data",
          headline: "The verdict could not be verified against tool data.",
          price_check: `Unverifiable figures were used (${bad}); no verdict is given rather than a guessed one.`,
          risks: ["Verdict figures did not match tool outputs.", "See the step trace for raw data.", "Re-run once comparables load."],
          strengths: ["Tool trace is preserved below.", "Area and memo pages still show raw figures."],
          questions_to_ask_agent: [
            "What is the full postcode?",
            "What is the floor area in sq m?",
            "Is it a flat or a house?",
          ],
          sources: ["diligence tool trace"],
        },
        steps,
        rounds: rounds + 1,
        verification: check,
        repaired: true,
      };
    }
    return { verdict: v, steps, rounds, verification: check, repaired };
  }
}
