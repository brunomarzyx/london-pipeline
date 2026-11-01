import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RateLimiter,
  clientIp,
  limitResponse,
  readBucketMax,
  readDailyMax,
  readWindowMs,
} from "./ratelimit";

const cfg = { max: 3, windowMs: 1000 };

describe("RateLimiter", () => {
  it("allows up to max then blocks with retry-after", () => {
    let t = 0;
    const rl = new RateLimiter(() => t);
    expect(rl.check("a", cfg, 0)).toEqual({ ok: true, remaining: 2 });
    rl.check("a", cfg, 0);
    expect(rl.check("a", cfg, 0)).toEqual({ ok: true, remaining: 0 });
    const v = rl.check("a", cfg, 0);
    expect(v).toEqual({ ok: false, retryAfterSec: 1, reason: "ip" });
  });

  it("tracks IPs independently and resets after the window", () => {
    let t = 0;
    const rl = new RateLimiter(() => t);
    for (let i = 0; i < 3; i++) rl.check("a", cfg, 0);
    expect(rl.check("a", cfg, 0).ok).toBe(false);
    expect(rl.check("b", cfg, 0).ok).toBe(true);
    t = 1001;
    expect(rl.check("a", cfg, 0).ok).toBe(true);
  });

  it("enforces the global daily cap and resets after 24h", () => {
    let t = 0;
    const rl = new RateLimiter(() => t);
    const none = { max: 0, windowMs: 1000 };
    expect(rl.check("x", none, 2).ok).toBe(true);
    expect(rl.check("y", none, 2).ok).toBe(true);
    const v = rl.check("z", none, 2);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("global");
    t = 24 * 60 * 60 * 1000 + 1;
    expect(rl.check("z", none, 2).ok).toBe(true);
  });

  it("max 0 disables the per-IP limit", () => {
    const rl = new RateLimiter(() => 0);
    for (let i = 0; i < 50; i++) expect(rl.check("a", { max: 0, windowMs: 1000 }, 0).ok).toBe(true);
  });
});

describe("env and IP parsing", () => {
  it("reads env with defaults and ignores junk", () => {
    expect(readBucketMax("model", {} as unknown as NodeJS.ProcessEnv)).toBe(15);
    expect(readBucketMax("brief", {} as unknown as NodeJS.ProcessEnv)).toBe(60);
    expect(readBucketMax("model", ({ RATE_LIMIT_MAX: "5" } as unknown as NodeJS.ProcessEnv))).toBe(5);
    expect(readBucketMax("model", ({ RATE_LIMIT_MAX: "abc" } as unknown as NodeJS.ProcessEnv))).toBe(15);
    expect(readDailyMax(({ RATE_LIMIT_DAILY_MAX: "0" } as unknown as NodeJS.ProcessEnv))).toBe(0);
    expect(readWindowMs(({ RATE_LIMIT_WINDOW_SECONDS: "60" } as unknown as NodeJS.ProcessEnv))).toBe(60000);
  });

  it("prefers fly-client-ip, then first x-forwarded-for hop", () => {
    expect(clientIp(new Headers({ "fly-client-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("limitResponse", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns 429 after the configured cap, and never limits in mock mode", async () => {
    vi.stubEnv("MOCK_META", "0");
    vi.stubEnv("RATE_LIMIT_MAX", "2");
    vi.stubEnv("RATE_LIMIT_DAILY_MAX", "0");
    const mk = () => new Request("http://x/api/ask", { headers: { "fly-client-ip": "9.9.9.9" } });
    expect(limitResponse(mk(), "model")).toBeNull();
    expect(limitResponse(mk(), "model")).toBeNull();
    const res = limitResponse(mk(), "model");
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBeTruthy();
    expect((await res!.json()).error).toMatch(/Rate limit/);

    vi.stubEnv("MOCK_META", "1");
    expect(limitResponse(mk(), "model")).toBeNull();
  });
});
