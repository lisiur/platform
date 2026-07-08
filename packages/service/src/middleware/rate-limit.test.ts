import { OpenAPIHono } from "@hono/zod-openapi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/session", () => ({
  getSessionFromHeaders: vi.fn(),
}));

import { rateLimitRegistry } from "#lib/rate-limit-registry";
import { RateLimitStore } from "#lib/rate-limit-store";
import { getSessionFromHeaders } from "#lib/session";
import { createRateLimiter } from "#middleware/rate-limit";

const mockGetSession = vi.mocked(getSessionFromHeaders);

let nameSeq = 0;
function createApp(opts: {
  max: number;
  windowMs?: number;
  enabled?: boolean;
}) {
  const app = new OpenAPIHono();
  app.use(
    "*",
    createRateLimiter({
      name: `test-${nameSeq++}`,
      max: opts.max,
      windowMs: opts.windowMs ?? 1000,
      enabled: opts.enabled,
      store: new RateLimitStore(0),
    }),
  );
  app.get("/ping", (c) => c.json({ ok: true }, 200));
  return app;
}

describe("RateLimitStore", () => {
  it("increments count within a window", () => {
    const store = new RateLimitStore(0);
    expect(store.hit("k", 1000)).toEqual({
      count: 1,
      resetAt: expect.any(Number),
    });
    expect(store.hit("k", 1000).count).toBe(2);
    expect(store.hit("k", 1000).count).toBe(3);
  });

  it("resets the window after expiry", () => {
    vi.useFakeTimers();
    const store = new RateLimitStore(0);
    store.hit("k", 1000);
    store.hit("k", 1000);
    vi.advanceTimersByTime(1001);
    expect(store.hit("k", 1000).count).toBe(1);
    vi.useRealTimers();
  });

  it("evicts expired entries on sweep", () => {
    vi.useFakeTimers();
    const store = new RateLimitStore(0);
    store.hit("k", 1000);
    vi.advanceTimersByTime(1001);
    store.sweep();
    // After sweep + fresh hit, count starts over (entry was removed)
    expect(store.hit("k", 1000).count).toBe(1);
    vi.useRealTimers();
  });

  it("reports whether a bucket actually existed on reset", () => {
    const store = new RateLimitStore(0);
    store.hit("k", 1000);
    expect(store.reset("k")).toBe(true);
    // No bucket present anymore -> reset is a no-op
    expect(store.reset("k")).toBe(false);
  });
});

describe("createRateLimiter middleware", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetSession.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit and sets rate-limit headers", async () => {
    const app = createApp({ max: 2 });
    const res = await app.request("/ping");

    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-limit")).toBe("2");
    expect(res.headers.get("x-ratelimit-remaining")).toBe("1");
    expect(res.headers.get("x-ratelimit-reset")).toBeTruthy();
  });

  it("returns 429 once the limit is exceeded", async () => {
    const app = createApp({ max: 1 });
    const ok = await app.request("/ping");
    expect(ok.status).toBe(200);

    const blocked = await app.request("/ping");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    await expect(blocked.json()).resolves.toEqual({
      code: 429,
      message: "Too Many Requests",
    });
  });

  it("keys by ip for anonymous requests", async () => {
    const app = createApp({ max: 1 });
    const a = await app.request("/ping", {
      headers: { "x-forwarded-for": "1.1.1.1" },
    });
    const b = await app.request("/ping", {
      headers: { "x-forwarded-for": "2.2.2.2" },
    });

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it("keys by user id when authenticated", async () => {
    const app = createApp({ max: 1 });
    mockGetSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { id: "session-1" },
    } as Awaited<ReturnType<typeof getSessionFromHeaders>>);

    const authed = await app.request("/ping");
    expect(authed.status).toBe(200);

    // Different user, still allowed despite user-1 being at the limit
    mockGetSession.mockResolvedValue({
      user: { id: "user-2" },
      session: { id: "session-2" },
    } as Awaited<ReturnType<typeof getSessionFromHeaders>>);
    const other = await app.request("/ping");
    expect(other.status).toBe(200);

    // Same user again -> blocked
    mockGetSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { id: "session-1" },
    } as Awaited<ReturnType<typeof getSessionFromHeaders>>);
    const blocked = await app.request("/ping");
    expect(blocked.status).toBe(429);
  });

  it("is a no-op when disabled", async () => {
    const app = createApp({ max: 1, enabled: false });
    for (let i = 0; i < 5; i++) {
      const res = await app.request("/ping");
      expect(res.status).toBe(200);
      expect(res.headers.get("x-ratelimit-limit")).toBeNull();
    }
  });

  it("resets after the window elapses", async () => {
    vi.useFakeTimers({ now: new Date(0) });
    const app = createApp({ max: 1, windowMs: 1000 });

    const first = await app.request("/ping");
    expect(first.status).toBe(200);

    const blocked = await app.request("/ping");
    expect(blocked.status).toBe(429);

    vi.advanceTimersByTime(1001);
    const after = await app.request("/ping");
    expect(after.status).toBe(200);
  });
});

describe("rateLimitRegistry overrides", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(0) });
    rateLimitRegistry.registerLimiter({
      name: "rl-test",
      max: 3,
      windowMs: 1000,
      enabled: true,
      store: new RateLimitStore(0),
    });
  });

  afterEach(() => {
    rateLimitRegistry.removeOverride("ip:1.2.3.4");
    vi.useRealTimers();
  });

  it("applies a looser custom max override", () => {
    rateLimitRegistry.setOverride({
      subject: "ip:1.2.3.4",
      max: 100,
      windowMs: null,
      bypass: false,
      startAt: null,
      endAt: null,
    });
    expect(rateLimitRegistry.resolvePolicy("rl-test", "ip:1.2.3.4").max).toBe(
      100,
    );
  });

  it("bypasses entirely when override is a whitelist", () => {
    rateLimitRegistry.setOverride({
      subject: "ip:1.2.3.4",
      max: null,
      windowMs: null,
      bypass: true,
      startAt: null,
      endAt: null,
    });
    expect(
      rateLimitRegistry.resolvePolicy("rl-test", "ip:1.2.3.4").bypass,
    ).toBe(true);
  });

  it("ignores an override outside its active time window", () => {
    rateLimitRegistry.setOverride({
      subject: "ip:1.2.3.4",
      max: 100,
      windowMs: null,
      bypass: false,
      startAt: new Date(5_000),
      endAt: new Date(10_000),
    });

    // before window -> base policy
    expect(rateLimitRegistry.resolvePolicy("rl-test", "ip:1.2.3.4").max).toBe(
      3,
    );

    // within window -> override
    vi.advanceTimersByTime(5_000);
    expect(rateLimitRegistry.resolvePolicy("rl-test", "ip:1.2.3.4").max).toBe(
      100,
    );

    // after window -> base policy again
    vi.advanceTimersByTime(6_000);
    expect(rateLimitRegistry.resolvePolicy("rl-test", "ip:1.2.3.4").max).toBe(
      3,
    );
  });

  it("reports blocked buckets in the status snapshot", () => {
    const store = new RateLimitStore(0);
    rateLimitRegistry.registerLimiter({
      name: "rl-snap",
      max: 2,
      windowMs: 1000,
      enabled: true,
      store,
    });
    store.hit("ip:9.9.9.9", 1000);
    store.hit("ip:9.9.9.9", 1000);
    store.hit("ip:9.9.9.9", 1000); // over the limit

    const [status] = rateLimitRegistry.snapshot("rl-snap");
    const bucket = status.buckets.find((b) => b.subject === "ip:9.9.9.9");
    expect(bucket?.blocked).toBe(true);
    expect(bucket?.count).toBe(3);
  });
});

describe("rateLimitRegistry release", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(0) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("releaseKey only reports true when a bucket existed", () => {
    const store = new RateLimitStore(0);
    rateLimitRegistry.registerLimiter({
      name: "rl-release-key",
      max: 2,
      windowMs: 1000,
      enabled: true,
      store,
    });
    store.hit("ip:1.1.1.1", 1000);

    expect(rateLimitRegistry.releaseKey("rl-release-key", "ip:1.1.1.1")).toBe(
      true,
    );
    // Second release: bucket is gone, nothing to release
    expect(rateLimitRegistry.releaseKey("rl-release-key", "ip:1.1.1.1")).toBe(
      false,
    );
  });

  it("releaseKey returns false for an unknown limiter", () => {
    expect(rateLimitRegistry.releaseKey("nope", "ip:1.1.1.1")).toBe(false);
  });

  it("releaseSubject only lists limiters that had a bucket", () => {
    const storeA = new RateLimitStore(0);
    const storeB = new RateLimitStore(0);
    rateLimitRegistry.registerLimiter({
      name: "rl-release-a",
      max: 2,
      windowMs: 1000,
      enabled: true,
      store: storeA,
    });
    rateLimitRegistry.registerLimiter({
      name: "rl-release-b",
      max: 2,
      windowMs: 1000,
      enabled: true,
      store: storeB,
    });

    // Only limiter A has a bucket for this subject
    storeA.hit("ip:7.7.7.7", 1000);

    expect(rateLimitRegistry.releaseSubject("ip:7.7.7.7").sort()).toStrictEqual(
      ["rl-release-a"],
    );

    // After release, releasing again yields nothing
    expect(rateLimitRegistry.releaseSubject("ip:7.7.7.7")).toStrictEqual([]);
  });
});

describe("rateLimitRegistry updateDefaults", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(0) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mutates max/windowMs live so resolvePolicy reflects new values", () => {
    const store = new RateLimitStore(0);
    rateLimitRegistry.registerLimiter({
      name: "rl-defaults",
      max: 2,
      windowMs: 1000,
      enabled: true,
      store,
    });

    expect(
      rateLimitRegistry.resolvePolicy("rl-defaults", "ip:1.1.1.1"),
    ).toEqual({ bypass: false, max: 2, windowMs: 1000 });

    expect(
      rateLimitRegistry.updateDefaults("rl-defaults", {
        max: 50,
        windowMs: 5000,
      }),
    ).toBe(true);
    expect(
      rateLimitRegistry.resolvePolicy("rl-defaults", "ip:1.1.1.1"),
    ).toEqual({ bypass: false, max: 50, windowMs: 5000 });
  });

  it("returns false for an unknown limiter", () => {
    expect(rateLimitRegistry.updateDefaults("nope", { max: 1 })).toBe(false);
  });

  it("preserves the store reference across updates", () => {
    const store = new RateLimitStore(0);
    rateLimitRegistry.registerLimiter({
      name: "rl-store-ref",
      max: 2,
      windowMs: 1000,
      enabled: true,
      store,
    });
    store.hit("ip:3.3.3.3", 1000);

    rateLimitRegistry.updateDefaults("rl-store-ref", { max: 99 });
    const [status] = rateLimitRegistry.snapshot("rl-store-ref");
    const bucket = status.buckets.find((b) => b.subject === "ip:3.3.3.3");
    // bucket survived the defaults update because the store ref is unchanged
    expect(bucket?.count).toBe(1);
  });

  it("disabling a limiter makes the middleware skip limiting", async () => {
    const app = new OpenAPIHono();
    app.use(
      "*",
      createRateLimiter({
        name: "rl-disable-mw",
        max: 1,
        windowMs: 1000,
        enabled: true,
        store: new RateLimitStore(0),
      }),
    );
    app.get("/ping", (c) => c.json({ ok: true }, 200));

    // First request consumes the single allowed request
    const first = await app.request("/ping");
    expect(first.status).toBe(200);

    // Disabling at runtime -> subsequent requests are no longer limited
    rateLimitRegistry.updateDefaults("rl-disable-mw", { enabled: false });
    for (let i = 0; i < 5; i++) {
      const res = await app.request("/ping");
      expect(res.status).toBe(200);
      expect(res.headers.get("x-ratelimit-limit")).toBeNull();
    }
  });
});
