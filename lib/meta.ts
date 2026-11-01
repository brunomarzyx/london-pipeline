import OpenAI from "openai";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

const BASE_URL = process.env.META_BASE_URL ?? "https://api.meta.ai/v1";
const MODEL = process.env.META_MODEL ?? "muse-spark-1.3";
const MOCK = process.env.MOCK_META === "1";

export interface ChatOptions {
  system?: string;
  maxTokens?: number;
  fixture?: string;
  effort?: "low" | "medium" | "high";
  /** Optional image data URLs (data:image/...;base64,...) sent with the user message. */
  images?: string[];
}

export interface UsageRecord {
  ts: string;
  model: string;
  prompt: string;
  completion: string;
  cached_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  mock: boolean;
}

function client() {
  return new OpenAI({
    baseURL: BASE_URL,
    apiKey: process.env.MODEL_API_KEY ?? "",
    // Global fetch honors NODE_USE_ENV_PROXY, so calls work behind a proxy.
    fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  });
}

async function logUsage(record: UsageRecord): Promise<void> {
  const dir = path.join(process.cwd(), "logs");
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(
    path.join(dir, "usage.jsonl"),
    JSON.stringify(record) + "\n",
  );
}

async function readFixture(name: string): Promise<string> {
  const raw = await fs.readFile(
    path.join(process.cwd(), "fixtures", "meta", `${name}.json`),
    "utf8",
  );
  return (JSON.parse(raw) as { reply: string }).reply;
}

export async function chat(
  userMessage: string,
  opts: ChatOptions = {},
): Promise<{ reply: string; usage: UsageRecord }> {
  // Reasoning tokens count against max_tokens; 1024 left Brief replies empty.
  const maxTokens = Math.max(opts.maxTokens ?? 4096, 4096);
  let reply: string;
  let cached = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  if (MOCK) {
    reply = await readFixture(opts.fixture ?? "chat");
  } else {
    const res = await client().chat.completions.create({
      model: MODEL,
      max_tokens: maxTokens,
      ...(opts.effort
        ? { reasoning_effort: opts.effort } as Record<string, unknown>
        : {}),
      messages: [
        ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
        {
          role: "user" as const,
          content: opts.images?.length
            ? [
                { type: "text" as const, text: userMessage },
                ...opts.images.map((url) => ({
                  type: "image_url" as const,
                  image_url: { url },
                })),
              ]
            : userMessage,
        },
      ],
    });
    reply = res.choices[0]?.message?.content ?? "";
    cached = res.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    promptTokens = res.usage?.prompt_tokens ?? 0;
    completionTokens = res.usage?.completion_tokens ?? 0;
    totalTokens = res.usage?.total_tokens ?? 0;
  }
  const usage: UsageRecord = {
    ts: new Date().toISOString(),
    model: MODEL,
    prompt: userMessage,
    completion: reply,
    cached_tokens: cached,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    mock: MOCK,
  };
  await logUsage(usage);
  return { reply, usage };
}

export async function chatJSON<T>(
  userMessage: string,
  schema: z.ZodType<T>,
  opts: ChatOptions = {},
): Promise<T> {
  const system =
    opts.system ??
    "Reply with a single JSON object only, no other text.";
  const first = await chat(userMessage, { ...opts, system });
  const parsed = schema.safeParse(tryJSON(first.reply));
  if (parsed.success) return parsed.data;
  const retry = await chat(
    `${userMessage}\n\nThe previous reply was not valid JSON for the schema: ${parsed.error.message}. Reply with a single JSON object only, no other text.`,
    { ...opts, system },
  );
  const second = schema.safeParse(tryJSON(retry.reply));
  if (second.success) return second.data;
  throw new Error("Model did not return valid JSON after retry");
}

function tryJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
