import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Pre-computed results for the exact demo inputs, so the recorded demo is instant and repeatable.
 * Written by scripts/precompute-demo.ts (one live run each), served only on an exact input match
 * and only when the caller did not ask for a live run (?live=1). Every cached response is
 * labelled in the UI ("cached run · <date>").
 */
export type DemoKind = "ask" | "diligence" | "check";

export const DEMO_LISTING =
  "2 bed flat on Copleston Road, London SE15 4AN. £650,000. 70 sq m internal area.";

export const DEMO_INPUTS: { id: string; kind: DemoKind; input: Record<string, unknown> }[] = [
  {
    id: "ask-se15",
    kind: "ask",
    input: { question: "Is £650k fair for a 70 sq m flat at SE15 4AN?" },
  },
  {
    id: "diligence-se15-buyer",
    kind: "diligence",
    input: { text: DEMO_LISTING, postcode: null, price: null, goal: "buyer" },
  },
  {
    id: "diligence-se15-investor",
    kind: "diligence",
    input: { text: DEMO_LISTING, postcode: null, price: null, goal: "investor" },
  },
  {
    id: "check-se15",
    kind: "check",
    input: { text: DEMO_LISTING },
  },
];

export interface CacheEntry<T = unknown> {
  id: string;
  kind: DemoKind;
  /** Normalised input the entry was recorded for. */
  input: Record<string, unknown>;
  savedAt: string;
  /** True when recorded under MOCK_META=1 (fixtures, not the live model). */
  mock: boolean;
  result: T;
}

export type { CacheLabel } from "./cache-label";
import type { CacheLabel } from "./cache-label";

export const cacheDir = (): string =>
  process.env.DEMO_CACHE_DIR ?? path.join(process.cwd(), "data", "demo-cache");

const clean = (s: unknown): string => String(s ?? "").trim().replace(/\s+/g, " ");

/** Canonical form used for exact-match comparison. */
export function normaliseInput(kind: DemoKind, input: Record<string, unknown>): Record<string, unknown> {
  if (kind === "ask") return { question: clean(input.question) };
  if (kind === "check") return { text: clean(input.text) };
  const price = input.price == null || input.price === "" ? null : Number(input.price);
  return {
    text: clean(input.text),
    postcode: clean(input.postcode).toUpperCase() || null,
    price,
    goal: input.goal === "investor" ? "investor" : "buyer",
  };
}

const sameInput = (a: Record<string, unknown>, b: Record<string, unknown>): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** True if the request asks for a live run (?live=1). */
export function wantsLive(req: Request): boolean {
  try {
    return new URL(req.url).searchParams.get("live") === "1";
  } catch {
    return false;
  }
}

export async function readCache<T>(
  kind: DemoKind,
  input: Record<string, unknown>,
): Promise<CacheEntry<T> | null> {
  const want = normaliseInput(kind, input);
  for (const d of DEMO_INPUTS) {
    if (d.kind !== kind || !sameInput(normaliseInput(kind, d.input), want)) continue;
    try {
      const raw = await fs.readFile(path.join(cacheDir(), `${d.id}.json`), "utf8");
      const e = JSON.parse(raw) as CacheEntry<T>;
      if (e && e.kind === kind && sameInput(normaliseInput(kind, e.input), want)) return e;
    } catch {
      /* no cache file for this input yet */
    }
  }
  return null;
}

export async function writeCache(
  id: string,
  kind: DemoKind,
  input: Record<string, unknown>,
  result: unknown,
  mock: boolean,
): Promise<void> {
  await fs.mkdir(cacheDir(), { recursive: true });
  const entry: CacheEntry = {
    id,
    kind,
    input: normaliseInput(kind, input),
    savedAt: new Date().toISOString(),
    mock,
    result,
  };
  await fs.writeFile(path.join(cacheDir(), `${id}.json`), JSON.stringify(entry, null, 2) + "\n");
}

export const cacheLabel = (e: CacheEntry): CacheLabel => ({ at: e.savedAt, mock: e.mock });
