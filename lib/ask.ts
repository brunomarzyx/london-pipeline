import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { chat } from "./meta";
import { getAllMetrics, getBoroughDetail } from "./db";
import { getAreaComps, pricePercentile } from "./street";
import { getAreaScore } from "./area-score";
import { getCityMetrics } from "./global-data";

export const MAX_TOOL_ROUNDS = 4;

const MetricKey = z.enum([
  "priceChange",
  "netBuildup",
  "pressure",
  "momentum",
  "grossYield",
  "priceToRent",
  "rentChange",
  "salesChange",
  "newBuildShare",
]);
type MetricKey = z.infer<typeof MetricKey>;

const ListArgs = z.object({});
const GetArgs = z.object({ code: z.string().min(1).max(12) });
const RankArgs = z.object({
  metric: MetricKey,
  n: z.number().int().min(1).max(33),
  order: z.enum(["desc", "asc"]),
});
const CityArgs = z.object({ city: z.string().min(1).max(40) });
const CompsArgs = z.object({
  postcode: z.string().min(1).max(10),
  type: z.enum(["flat", "house"]).optional(),
  price: z.number().int().positive().max(100_000_000).optional(),
  sqm: z.number().positive().max(1000).optional(),
});
const RiskArgs = z.object({
  postcode: z.string().min(1).max(10),
  lens: z.enum(["buyer", "investor"]).optional(),
});

const ModelReply = z.union([
  z.object({
    type: z.literal("tool_call"),
    name: z.enum([
      "list_boroughs",
      "get_borough_metrics",
      "rank_boroughs",
      "get_city_metrics",
      "get_area_comps",
      "get_area_risk",
    ]),
    args: z.unknown(),
  }),
  z.object({ type: z.literal("final"), answer: z.string().min(1).max(3000) }),
]);

export function runTool(name: string, args: unknown): string {
  if (name === "list_boroughs") {
    const parsed = ListArgs.safeParse(args ?? {});
    if (!parsed.success) return `error: invalid args (${parsed.error.message})`;
    const all = getAllMetrics();
    return JSON.stringify(all.map((b) => ({ code: b.code, name: b.name })));
  }
  if (name === "get_borough_metrics") {
    const parsed = GetArgs.safeParse(args);
    if (!parsed.success) return `error: invalid args (${parsed.error.message})`;
    const d = getBoroughDetail(parsed.data.code);
    if (!d)
      return JSON.stringify({
        code: parsed.data.code,
        metrics: null,
        note: "unknown borough code",
      });
    return JSON.stringify(roundMetrics(d));
  }
  if (name === "rank_boroughs") {
    const parsed = RankArgs.safeParse(args);
    if (!parsed.success) return `error: invalid args (${parsed.error.message})`;
    const { metric, n, order } = parsed.data;
    const rows = getAllMetrics()
      .map((b) => ({
        code: b.code,
        name: b.name,
        value: b[metric] == null ? null : Math.round(b[metric] * 10000) / 10000,
      }))
      .sort((a, b) => {
        if (a.value == null && b.value == null) return 0;
        if (a.value == null) return 1;
        if (b.value == null) return -1;
        return order === "desc" ? b.value - a.value : a.value - b.value;
      })
      .slice(0, n);
    return JSON.stringify(rows);
  }
  if (name === "get_area_comps") {
    const parsed = CompsArgs.safeParse(args);
    if (!parsed.success) return `error: invalid args (${parsed.error.message})`;
    const r = getAreaComps(parsed.data.postcode, parsed.data.type ?? null, parsed.data.sqm ?? null);
    if ("error" in r)
      return JSON.stringify({ postcode: parsed.data.postcode, comps: null, note: r.error });
    const prices = r.comps.map((c) => c.price);
    const pct =
      parsed.data.price != null ? pricePercentile(parsed.data.price, prices) : null;
    return JSON.stringify({
      postcode: r.postcode,
      type: r.type,
      level: r.chosenLevel,
      name: r.chosenName,
      n: r.chosenN,
      median: r.chosenMedian,
      p25: r.chosenP25,
      p75: r.chosenP75,
      momentum1y: r.momentum.chg1y,
      momentum5y: r.momentum.chg5y,
      momentumFrom: r.momentum.from,
      askingPrice: parsed.data.price ?? null,
      askingPercentile: pct,
      ppsmLevel: r.ppsm?.level ?? null,
      ppsmName: r.ppsm?.name ?? null,
      ppsmN: r.ppsm?.n ?? null,
      ppsmMedian: r.ppsm?.median != null ? Math.round(r.ppsm.median) : null,
      ppsmP25: r.ppsm?.p25 != null ? Math.round(r.ppsm.p25) : null,
      ppsmP75: r.ppsm?.p75 != null ? Math.round(r.ppsm.p75) : null,
      floorArea: parsed.data.sqm ?? null,
      fairLow: r.ppsm?.fairRange?.low ?? null,
      fairMid: r.ppsm?.fairRange?.mid ?? null,
      fairHigh: r.ppsm?.fairRange?.high ?? null,
      imdDecile: r.context?.imdDecile ?? null,
      ptal: r.context?.ptal ?? null,
      crime12m: r.context?.crime12m ?? null,
      crimePctileLondon: r.context?.crimePctile ?? null,
      crimeWindow: r.context?.crimeWindow ?? null,
      askingPpsm:
        parsed.data.price != null && parsed.data.sqm ? Math.round(parsed.data.price / parsed.data.sqm) : null,
      asof: r.asof,
    });
  }
  if (name === "get_area_risk") {
    const parsed = RiskArgs.safeParse(args);
    if (!parsed.success) return `error: invalid args (${parsed.error.message})`;
    const r = getAreaScore(parsed.data.postcode, parsed.data.lens ?? "buyer");
    if (!r.postcode)
      return JSON.stringify({ postcode: parsed.data.postcode, risk: null, note: "invalid postcode" });
    if (!r.located)
      return JSON.stringify({ postcode: r.postcode, risk: null, note: "postcode not located" });
    const slim = (c: {
      key: string;
      label: string;
      score: number | null;
      headline: string;
      facts: Record<string, string | number | boolean | null>;
      source: string;
      asof: string;
    }) => ({
      key: c.key,
      label: c.label,
      score: c.score,
      headline: c.headline,
      facts: c.facts,
      source: c.source,
      asof: c.asof,
    });
    return JSON.stringify({
      postcode: r.postcode,
      lens: r.lens,
      located: r.located,
      score: r.score,
      band: r.band,
      lowCoverage: r.lowCoverage,
      available: r.available,
      total: r.total,
      drivers: r.drivers.map(slim),
      strengths: r.strengths.map(slim),
      components: r.components.map(slim),
      supplyUnits: r.supplyPressure?.units ?? null,
      supplyPercentile: r.supplyPressure?.percentile ?? null,
      supplyTop: r.supplyPressure?.top ?? [],
    });
  }
  if (name === "get_city_metrics") {
    const parsed = CityArgs.safeParse(args);
    if (!parsed.success) return `error: invalid args (${parsed.error.message})`;
    const m = getCityMetrics(parsed.data.city);
    if (!m)
      return JSON.stringify({
        city: parsed.data.city,
        metrics: null,
        note: "unknown city (try London, Paris, Berlin, Tel Aviv, Toronto, Sao Paulo, Sydney, Tokyo)",
      });
    const r = (v: number | null) =>
      v == null ? null : Math.round(v * 10000) / 10000;
    return JSON.stringify({
      ...m,
      real1y: r(m.real1y),
      real5y: r(m.real5y),
      distFromPeak: r(m.distFromPeak),
      policyRate: r(m.policyRate),
      policyChange12m: r(m.policyChange12m),
      spark: m.spark.map((o) => ({ p: o.p, v: Math.round(o.v * 100) / 100 })),
    });
  }
  return `error: unknown tool "${name}"`;
}

function roundMetrics(d: ReturnType<typeof getBoroughDetail>): object | null {
  if (!d) return null;
  const r = (v: number | null) => (v == null ? null : Math.round(v * 10000) / 10000);
  return {
    code: d.code,
    name: d.name,
    latestPrice: d.latestPrice == null ? null : Math.round(d.latestPrice),
    priceChange: r(d.priceChange),
    netBuildup: d.netBuildup,
    pressure: r(d.pressure),
    momentum: r(d.momentum),
    avgRent: d.avgRent == null ? null : Math.round(d.avgRent),
    rentChange: r(d.rentChange),
    grossYield: r(d.grossYield),
    priceToRent: r(d.priceToRent),
    latestSales: d.latestSales,
    salesChange: r(d.salesChange),
    newBuildShare: r(d.newBuildShare),
  };
}

function tryJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** First complete JSON object embedded anywhere in the reply (prose ignored). */
export function extractJSON(text: string): unknown {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(i, j + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return tryJSON(text);
}

/** One-line rendering of tool results for the forced fallback answer. */
export function renderSummary(history: { name: string; result: string }[]): string {
  if (!history.length) return "no tool results (data missing)";
  return history
    .map((h) => {
      const parsed = tryJSON(h.result);
      if (Array.isArray(parsed)) {
        const top = parsed
          .slice(0, 5)
          .map((r) => `${r.name}: ${r.value ?? "no data"}`)
          .join("; ");
        return `${h.name} → ${top || "empty ranking"}`;
      }
      if (parsed && typeof parsed === "object") {
        const m = parsed as Record<string, unknown>;
        if (m.metrics === null)
          return `${h.name}(${JSON.stringify((m as { code?: string }).code)}) → no data (${(m as { note?: string }).note ?? "missing"})`;
        return `${h.name} → ${h.result}`;
      }
      return `${h.name} → ${h.result}`;
    })
    .join(" | ");
}

function mockFixtureFor(question: string, round: number): string {
  if (/\[loop\]/.test(question)) return "ask-loop";
  if (/approv|permission|consent/i.test(question)) return "ask-approvals";
  if (/risk|area score/i.test(question))
    return round === 0 ? "ask-risk-tool" : "ask-risk-final";
  if (/fair|postcode|E ?\d/i.test(question))
    return round === 0 ? "ask-comps-tool" : "ask-comps-final";
  return round === 0 ? "ask-tool" : "ask-final";
}

export interface AskVerification {
  total: number;
  verified: number;
}

async function verifyAnswer(
  answer: string,
  history: { name: string; result: string }[],
): Promise<AskVerification> {
  const { verifyFigures } = await import("./memo");
  const v = verifyFigures(
    [answer],
    history.map((h) => h.result),
  );
  return { total: v.total, verified: v.verified };
}

const INJECTION_RE =
  /ignor(e|ing) (your|these|all|the) instructions|disregard .*instructions|reveal (your|the) (system )?prompt|what is your system prompt/i;

export async function askQuestion(
  question: string,
): Promise<{ answer: string; rounds: number; verification: AskVerification }> {
  if (INJECTION_RE.test(question)) {
    return {
      answer:
        "I can't follow instructions embedded in a question. I answer questions about London housing supply, prices, rents and the housing cycle — for example, which borough has the highest supply pressure.",
      rounds: 0,
      verification: { total: 0, verified: 0 },
    };
  }
  const system = await fs.readFile(
    path.join(process.cwd(), "prompts", "ask.md"),
    "utf8",
  );
  const mock = process.env.MOCK_META === "1";
  const history: { name: string; result: string }[] = [];

  const transcript = (extra?: string) =>
    [question]
      .concat(
        history.map((h) => `Tool ${h.name} returned: ${h.result}`),
        extra ? [extra] : [],
      )
      .join("\n");

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const fixture = mock ? mockFixtureFor(question, round) : undefined;
    const { reply } = await chat(transcript(), {
      system,
      effort: "medium",
      ...(fixture ? { fixture } : {}),
    });
    const withSummary = reply.replace("{{summary}}", renderSummary(history));
    const parsed = ModelReply.safeParse(extractJSON(withSummary));
    if (!parsed.success) {
      history.push({
        name: "parse_error",
        result: `error: reply was not a valid tool_call/final object; answer with what you have`,
      });
      continue;
    }
    if (parsed.data.type === "final")
      return {
        answer: parsed.data.answer,
        rounds: round + 1,
        verification: await verifyAnswer(parsed.data.answer, history),
      };
    const result = runTool(parsed.data.name, parsed.data.args);
    history.push({ name: parsed.data.name, result });
  }

  const fixture = mock ? "ask-final" : undefined;
  const { reply } = await chat(
    transcript(
      "No more tool calls. Reply with {\"type\":\"final\",\"answer\":\"...\"} using only the numbers above; say what is missing.",
    ),
    { system, effort: "medium", ...(fixture ? { fixture } : {}) },
  );
  const parsed = ModelReply.safeParse(
    extractJSON(reply.replace("{{summary}}", renderSummary(history))),
  );
  if (parsed.success && parsed.data.type === "final")
    return {
      answer: parsed.data.answer,
      rounds: MAX_TOOL_ROUNDS + 1,
      verification: await verifyAnswer(parsed.data.answer, history),
    };
  const answer = `Based on the data: ${renderSummary(history)}. Approvals data is not in this build.`;
  return {
    answer,
    rounds: MAX_TOOL_ROUNDS + 1,
    verification: await verifyAnswer(answer, history),
  };
}
