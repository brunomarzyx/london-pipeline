import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { chat, chatJSON } from "./meta";
import { runTool } from "./ask";
import { getBoroughDetail } from "./db";
import { fmtHomes, fmtPct, fmtPrice, fmtPressure } from "./cycle-phase";

export const METHOD_FOOTNOTE =
  "Gross yield is a borough-level indicator (HPI average price vs ONS average rent). Sales change compares calendar 2025 with calendar 2024 (Land Registry).";

const FALLBACK_MARKET_READ =
  "For wider market context (London-focused listed housebuilders and residential landlords, gilt yields) see the figures above; no priced view is taken here.";

export const EvidenceSchema = z.object({
  claim: z.string().min(1).max(500),
  borough: z.string().min(1).max(12),
  metric: z.enum([
    "latestPrice",
    "priceChange",
    "netBuildup",
    "pressure",
    "momentum",
    "avgRent",
    "rentChange",
    "grossYield",
    "priceToRent",
    "latestSales",
    "salesChange",
    "newBuildShare",
  ]),
});

export const MemoSchema = z.object({
  title: z.string().min(1).max(200),
  call: z.string().min(1).max(200),
  // Up to one point per metric per borough (2 boroughs × 12 metrics); the prompt asks for the 6–8 that matter.
  evidence: z.array(EvidenceSchema).min(1).max(24),
  risks: z.array(z.string().min(1).max(300)).max(6),
  what_would_change_my_mind: z.string().min(1).max(500),
  market_read_across: z.string().min(1).max(600),
});

export type Memo = z.infer<typeof MemoSchema>;

export interface UnverifiedFigure {
  raw: string;
  context: string;
}

export interface Verification {
  total: number;
  verified: number;
  unverified: UnverifiedFigure[];
}

export function badgeText(v: Verification): string {
  if (v.total === 0) return "no figures to verify";
  return `✓ ${v.verified}/${v.total} figures verified against source data`;
}

interface Figure {
  raw: string;
  value: number;
  percent: boolean;
}

const FIGURE_RE =
  /£?\s?[−–—\-]?(\d[\d,]*(?:\.\d+)?)(\s?(?:%|％|×|x))?/g;

/** Normalise a numeric token: unicode minuses, thousands separators. */
function toNumber(digits: string, sign: string): number {
  const v = parseFloat(digits.replace(/,/g, ""));
  return sign === "-" ? -v : v;
}

/**
 * Every reader-facing figure in free text. Bare integers under 2100 with no
 * £/unit/comma/decimal are skipped (years like 2025, counts like "top 5",
 * "3 financial years" are not figures to prove).
 */
export function extractFigures(text: string): Figure[] {
  const out: Figure[] = [];
  // ISO dates and year-months (2025-09, 2026-08-31) are periods, not figures to prove.
  const norm = text
    .replace(/\b(?:19|20)\d{2}-\d{2}(?:-\d{2})?\b/g, " ")
    .replace(/[−–—]/g, "-")
    .replace(/％/g, "%");
  FIGURE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FIGURE_RE.exec(norm)) !== null) {
    const token = m[0];
    const digits = m[1];
    const unit = (m[2] ?? "").trim();
    const hasPound = token.includes("£");
    const hasUnit =
      unit === "%" || unit === "×" || unit.toLowerCase() === "x";
    const hasComma = digits.includes(",");
    const hasDecimal = digits.includes(".");
    const negative = /-/.test(token.replace("£", "").trimStart().slice(0, 1));
    const value = toNumber(digits, negative ? "-" : "+");
    if (!hasPound && !hasUnit && !hasComma && !hasDecimal) {
      if (value < 2100 && value > -2100) continue;
    }
    if (value >= 1900 && value <= 2100 && !hasPound && !hasUnit) continue;
    // "23.9% below peak" states a negative distance without a minus sign.
    const after = norm.slice(FIGURE_RE.lastIndex, FIGURE_RE.lastIndex + 40);
    const belowPeak =
      /^[^.]{0,40}?\bbelow\b[^.]{0,20}?\bpeak\b/i.test(after) && !negative;
    // "sales fell 6.4%" states a negative change without a minus sign.
    // Only for rates (%, x), never for £ levels or bare counts ("fell to 3,536").
    const before = norm.slice(Math.max(0, m.index - 30), m.index);
    const fellWord =
      /\b(fell|fall|falls|fallen|falling|declined|decline|declines|dropped|drop|drops|down|lower|weaker|contracted|shrank)\b[^.]{0,30}$/i.test(
        before,
      ) && !negative;
    const isRate =
      unit === "%" || unit === "×" || unit.toLowerCase() === "x";
    out.push({
      raw: token.trim(),
      value: belowPeak || (fellWord && isRate) ? -value : value,
      percent: unit === "%",
    });
  }
  return out;
}

/** All numeric values inside tool-result JSON strings (4dp fractions kept). */
export function collectToolNumbers(toolResults: string[]): number[] {
  const out: number[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object")
      Object.values(v as Record<string, unknown>).forEach(walk);
  };
  for (const r of toolResults) {
    try {
      walk(JSON.parse(r));
    } catch {
      // Non-JSON tool output contributes no verifiable numbers.
    }
  }
  return out;
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.051, Math.abs(b) * 0.002);
}

function isVerified(fig: Figure, toolNumbers: number[]): boolean {
  for (const t of toolNumbers) {
    if (close(fig.value, t)) return true;
    if (fig.percent && close(fig.value, t * 100)) return true;
  }
  return false;
}

/** Match every figure in the given texts against tool results. */
export function verifyFigures(
  texts: string[],
  toolResults: string[],
): Verification {
  const toolNumbers = collectToolNumbers(toolResults);
  const unverified: UnverifiedFigure[] = [];
  let total = 0;
  for (const text of texts) {
    for (const fig of extractFigures(text)) {
      total++;
      if (!isVerified(fig, toolNumbers)) {
        const i = text.indexOf(fig.raw);
        unverified.push({
          raw: fig.raw,
          context: text.slice(Math.max(0, i - 40), i + fig.raw.length + 40),
        });
      }
    }
  }
  return { total, verified: total - unverified.length, unverified };
}

function memoTexts(m: Memo): string[] {
  return [
    m.title,
    m.call,
    ...m.evidence.map((e) => e.claim),
    ...m.risks,
    m.what_would_change_my_mind,
    m.market_read_across,
  ];
}

function mockEvidence(toolResults: string[]): Memo["evidence"] {
  const out: Memo["evidence"] = [];
  for (const r of toolResults) {
    let d: Record<string, number | string | null>;
    try {
      d = JSON.parse(r) as Record<string, number | string | null>;
    } catch {
      continue;
    }
    if (d.metrics === null || typeof d.code !== "string") continue;
    const code = d.code as string;
    const num = (k: string): number | null =>
      typeof d[k] === "number" ? (d[k] as number) : null;
    const push = (
      metric: Memo["evidence"][number]["metric"],
      claim: string | null,
    ): void => {
      if (claim && out.length < 8) out.push({ claim, borough: code, metric });
    };
    const latestPrice = num("latestPrice");
    const priceChange = num("priceChange");
    const grossYield = num("grossYield");
    const rentChange = num("rentChange");
    const salesChange = num("salesChange");
    const netBuildup = num("netBuildup");
    push(
      "latestPrice",
      latestPrice == null ? null : `Average price ${fmtPrice(latestPrice)}.`,
    );
    push(
      "priceChange",
      priceChange == null ? null : `Prices moved ${fmtPct(priceChange)} over 12 months.`,
    );
    push(
      "grossYield",
      grossYield == null ? null : `Gross yield ${fmtPct(grossYield)}.`,
    );
    push(
      "rentChange",
      rentChange == null ? null : `Rents moved ${fmtPct(rentChange)} over 12 months.`,
    );
    push(
      "salesChange",
      salesChange == null
        ? null
        : `Sales in calendar 2025 vs 2024 moved ${fmtPct(salesChange * 100)}.`,
    );
    push(
      "netBuildup",
      netBuildup == null
        ? null
        : `Net pipeline build-up ${fmtHomes(netBuildup)} over 3 financial years.`,
    );
  }
  return out;
}

const MockQualitative = z.object({
  title: z.string().optional(),
  call: z.string().optional(),
  risks: z.array(z.string()).optional(),
  market_read_across: z.string().optional(),
});

function pressureClaim(
  toolResults: string[],
  code: string,
): Memo["evidence"][number] | null {
  for (const r of toolResults) {
    try {
      const d = JSON.parse(r) as Record<string, unknown>;
      if (d.code === code && typeof d.pressure === "number")
        return {
          claim: `Supply pressure ${fmtPressure(d.pressure)}.`,
          borough: code,
          metric: "pressure",
        };
    } catch {
      continue;
    }
  }
  return null;
}

function momentumClaim(
  toolResults: string[],
  code: string,
): Memo["evidence"][number] | null {
  for (const r of toolResults) {
    try {
      const d = JSON.parse(r) as Record<string, unknown>;
      if (d.code === code && typeof d.momentum === "number")
        return {
          claim: `Starts momentum ${fmtPct((d.momentum as number) * 100)} vs the prior 4 quarters.`,
          borough: code,
          metric: "momentum",
        };
    } catch {
      continue;
    }
  }
  return null;
}

export function memoToMarkdown(
  memo: Memo,
  verification: Verification,
  methodNote: string = METHOD_FOOTNOTE,
): string {
  const lines = [
    `# ${memo.title}`,
    "",
    `_${badgeText(verification)}_`,
    "",
    `**Call:** ${memo.call}`,
    "",
    "## Evidence",
    "",
    ...memo.evidence.map(
      (e) => `- ${e.claim} [source: ${e.borough} ${e.metric}]`,
    ),
    "",
    "## Risks",
    "",
    ...memo.risks.map((r) => `- ${r}`),
    "",
    `**What would change my mind:** ${memo.what_would_change_my_mind}`,
    "",
    `**Market read-across:** ${memo.market_read_across}`,
    "",
    `*Method: ${methodNote}*`,
  ];
  return lines.join("\n");
}

export interface MemoResult {
  memo: Memo;
  toolResults: string[];
  verification: Verification;
  markdown: string;
}

/**
 * Plan → call tools (get_borough_metrics per borough, 4dp fractions kept) →
 * draft the memo via Muse Spark (fixtures in MOCK_META=1) → verify every
 * figure against tool results. Unverified numbers in market_read_across are
 * removed (field replaced); elsewhere they are flagged in `verification`.
 */
export async function writeMemo(codes: string[]): Promise<MemoResult> {
  if (codes.length < 1 || codes.length > 2)
    throw new Error("writeMemo needs 1 or 2 borough codes");
  for (const c of codes) {
    if (!getBoroughDetail(c)) throw new Error(`unknown borough code: ${c}`);
  }
  const toolResults = codes.map((c) =>
    runTool("get_borough_metrics", { code: c }),
  );
  const system = await fs.readFile(
    path.join(process.cwd(), "prompts", "memo.md"),
    "utf8",
  );
  const userMessage = [
    `Boroughs: ${JSON.stringify(toolResults.map((r) => JSON.parse(r)))}`,
    `Method footnotes (repeat the substance once across the memo): ${METHOD_FOOTNOTE}`,
  ].join("\n");

  let memo: Memo;
  if (process.env.MOCK_META === "1") {
    const { reply } = await chat(userMessage, {
      system,
      effort: "medium",
      fixture: codes.length > 1 ? "memo-compare" : "memo",
    });
    let q: z.infer<typeof MockQualitative> = {};
    try {
      const parsed = MockQualitative.safeParse(JSON.parse(reply));
      if (parsed.success) q = parsed.data;
    } catch {
      // Fall through to defaults below.
    }
    const names = toolResults.map((r) => {
      try {
        return (JSON.parse(r) as { name?: string }).name ?? "borough";
      } catch {
        return "borough";
      }
    });
    const evidence = mockEvidence(toolResults);
    for (const c of codes) {
      const p = pressureClaim(toolResults, c);
      if (p && evidence.length < 8) evidence.push(p);
      const mo = momentumClaim(toolResults, c);
      if (mo && evidence.length < 8) evidence.push(mo);
    }
    memo = {
      title: q.title ?? `${names.join(" vs ")} — housing memo`,
      call: q.call ?? "neutral — figures below tell the story",
      evidence:
        evidence.length > 0
          ? evidence
          : [
              {
                claim: "No data for these boroughs.",
                borough: codes[0],
                metric: "latestPrice",
              },
            ],
      risks: q.risks ?? ["Small-sample metrics can swing on revisions."],
      what_would_change_my_mind:
        "A sustained turn in starts momentum alongside a price move the other way.",
      market_read_across: q.market_read_across ?? FALLBACK_MARKET_READ,
    };
  } else {
    // Low effort + headroom: at medium, reasoning consumed the whole 4,096-token budget and returned nothing.
    memo = await chatJSON(userMessage, MemoSchema, {
      system,
      effort: "low",
      maxTokens: 8192,
      fixture: codes.length > 1 ? "memo-compare" : "memo",
    });
  }

  // market_read_across is qualitative only: drop it if it smuggles figures.
  const marketFigs = extractFigures(memo.market_read_across);
  if (marketFigs.length > 0) {
    const nums = collectToolNumbers(toolResults);
    if (!marketFigs.every((f) => isVerified(f, nums)))
      memo = { ...memo, market_read_across: FALLBACK_MARKET_READ };
  }

  const verification = verifyFigures(memoTexts(memo), toolResults);
  return {
    memo,
    toolResults,
    verification,
    markdown: memoToMarkdown(memo, verification),
  };
}
