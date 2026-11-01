import { NextResponse } from "next/server";
import { DailyCapError, DAILY_CAP_MESSAGE } from "./meta";

/**
 * In-memory rate limiting for the routes that spend model tokens.
 * Per-IP fixed window plus one global daily cap, so a public URL cannot drain the API key.
 * State lives in the Node process (fine for a single Fly machine; resets on restart).
 *
 * Env (all optional; 0 disables that limit):
 *   RATE_LIMIT_MAX            model calls per IP per window for Ask London + memo (default 15)
 *   RATE_LIMIT_BRIEF_MAX      borough brief calls per IP per window (default 60)
 *   RATE_LIMIT_WINDOW_SECONDS window length (default 3600)
 *   RATE_LIMIT_DAILY_MAX      model calls across all visitors per 24h (default 1000)
 * Mock mode (MOCK_META=1) spends nothing, so it is never limited.
 */

export interface LimitConfig {
  max: number;
  windowMs: number;
}

export type Verdict =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number; reason: "ip" | "global" };

function envInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function readWindowMs(env: NodeJS.ProcessEnv = process.env): number {
  return Math.max(1, envInt(env, "RATE_LIMIT_WINDOW_SECONDS", 3600)) * 1000;
}

export function readDailyMax(env: NodeJS.ProcessEnv = process.env): number {
  return envInt(env, "RATE_LIMIT_DAILY_MAX", 1000);
}

export function readBucketMax(bucket: Bucket, env: NodeJS.ProcessEnv = process.env): number {
  return bucket === "brief"
    ? envInt(env, "RATE_LIMIT_BRIEF_MAX", 60)
    : envInt(env, "RATE_LIMIT_MAX", 15);
}

interface Entry {
  count: number;
  resetAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TRACKED = 5000;

export class RateLimiter {
  private ips = new Map<string, Entry>();
  private day: Entry = { count: 0, resetAt: 0 };

  constructor(private now: () => number = Date.now) {}

  check(ip: string, cfg: LimitConfig, dailyMax: number): Verdict {
    const t = this.now();

    if (dailyMax > 0) {
      if (t >= this.day.resetAt) this.day = { count: 0, resetAt: t + DAY_MS };
      if (this.day.count >= dailyMax)
        return { ok: false, retryAfterSec: Math.ceil((this.day.resetAt - t) / 1000), reason: "global" };
    }

    let remaining = Infinity;
    if (cfg.max > 0) {
      if (this.ips.size > MAX_TRACKED) this.purge(t);
      let e = this.ips.get(ip);
      if (!e || t >= e.resetAt) {
        e = { count: 0, resetAt: t + cfg.windowMs };
        this.ips.set(ip, e);
      }
      if (e.count >= cfg.max)
        return { ok: false, retryAfterSec: Math.ceil((e.resetAt - t) / 1000), reason: "ip" };
      e.count += 1;
      remaining = cfg.max - e.count;
    }

    if (dailyMax > 0) this.day.count += 1;
    return { ok: true, remaining };
  }

  private purge(t: number) {
    for (const [k, v] of this.ips) if (t >= v.resetAt) this.ips.delete(k);
    // Still too many live entries: drop the oldest half rather than grow without bound.
    if (this.ips.size > MAX_TRACKED) {
      let i = 0;
      const drop = Math.floor(this.ips.size / 2);
      for (const k of this.ips.keys()) {
        if (i++ >= drop) break;
        this.ips.delete(k);
      }
    }
  }
}

/** Behind Fly's proxy `fly-client-ip` is set by the platform; otherwise first X-Forwarded-For hop. */
export function clientIp(headers: Headers): string {
  const fly = headers.get("fly-client-ip");
  if (fly) return fly.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export type Bucket = "model" | "brief";

// Separate limiters so brief clicks do not eat the Ask London / memo allowance.
const limiters: Record<Bucket, RateLimiter> = { model: new RateLimiter(), brief: new RateLimiter() };
// The daily cap spans both buckets.
const dailyShared = new RateLimiter();

/** Returns a 429 response when the caller is over a limit, otherwise null. */
export function limitResponse(req: Request, bucket: Bucket): NextResponse | null {
  if (process.env.MOCK_META === "1") return null;
  const ip = clientIp(req.headers);
  const cfg = { max: readBucketMax(bucket), windowMs: readWindowMs() };
  const dailyMax = readDailyMax();

  const v = limiters[bucket].check(ip, cfg, 0);
  if (!v.ok) return tooMany(v.retryAfterSec, v.reason);
  const daily = dailyShared.check("all", { max: 0, windowMs: cfg.windowMs }, dailyMax);
  if (!daily.ok) return tooMany(daily.retryAfterSec, "global");
  return null;
}

function tooMany(retryAfterSec: number, reason: "ip" | "global"): NextResponse {
  const error =
    reason === "global"
      ? "The live demo has reached its daily limit for model calls. Try again tomorrow, or run it yourself (see the README)."
      : "Rate limit reached for model-backed requests from your address. Please wait and try again.";
  return NextResponse.json(
    { error, retryAfterSec },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

/** 429 for the daily token cap (see lib/meta.ts); null for any other error. */
export function dailyCapResponse(e: unknown): NextResponse | null {
  if (!(e instanceof DailyCapError)) return null;
  return NextResponse.json({ error: DAILY_CAP_MESSAGE, code: "daily_cap" }, { status: 429 });
}
