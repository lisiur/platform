import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { resolveTraceId, traceContext } from "#middleware/trace-context";

const VALID_RE = /^[0-9a-f-]{8,64}$/i;

function createApp() {
  const app = new OpenAPIHono();
  app.use("*", traceContext);
  app.get("/ping", (c) => c.json({ traceId: c.get("traceId") }, 200));
  return app;
}

describe("resolveTraceId", () => {
  it("accepts a canonical UUID v4 in x-trace-id", () => {
    const id = "018fc9c2-7a7e-4b7b-9c1a-2f3e4d5a6b7c";
    expect(resolveTraceId(id)).toBe(id);
  });

  it("accepts a 32-char bare hex", () => {
    const id = "018fc9c27a7e4b7b9c1a2f3e4d5a6b7c";
    expect(resolveTraceId(id)).toBe(id);
  });

  it("accepts an 8-char minimum hex", () => {
    const id = "deadbeef";
    expect(resolveTraceId(id)).toBe(id);
  });

  it("rejects non-hex characters", () => {
    const out = resolveTraceId("xyz-ghij-1234");
    expect(out).not.toBe("xyz-ghij-1234");
    expect(VALID_RE.test(out)).toBe(true);
  });

  it("rejects values shorter than 8 chars", () => {
    const out = resolveTraceId("abc123");
    expect(out).not.toBe("abc123");
    expect(VALID_RE.test(out)).toBe(true);
  });

  it("rejects values longer than 64 chars", () => {
    const long = "a".repeat(65);
    const out = resolveTraceId(long);
    expect(out).not.toBe(long);
    expect(VALID_RE.test(out)).toBe(true);
  });

  it("rejects whitespace-padded values", () => {
    const raw = "  018fc9c2-7a7e-4b7b-9c1a-2f3e4d5a6b7c  ";
    const out = resolveTraceId(raw);
    expect(out).not.toBe(raw);
    expect(VALID_RE.test(out)).toBe(true);
  });

  it("rejects path-traversal style garbage", () => {
    const out = resolveTraceId("../../etc/passwd");
    expect(VALID_RE.test(out)).toBe(true);
  });

  it("rejects a 10KB collision string", () => {
    const huge = "0".repeat(10_000);
    const out = resolveTraceId(huge);
    expect(out.length).toBeLessThan(65);
    expect(VALID_RE.test(out)).toBe(true);
  });

  it("falls back to a UUID when given undefined", () => {
    const out = resolveTraceId(undefined);
    expect(VALID_RE.test(out)).toBe(true);
  });
});

describe("traceContext middleware", () => {
  it("passes a valid x-trace-id through to ctx and response header", async () => {
    const app = createApp();
    const id = "018fc9c2-7a7e-4b7b-9c1a-2f3e4d5a6b7c";
    const res = await app.request("/ping", {
      headers: { "x-trace-id": id },
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.traceId).toBe(id);
    expect(res.headers.get("x-trace-id")).toBe(id);
  });

  it("falls back to x-request-id when x-trace-id is absent", async () => {
    const app = createApp();
    const id = "abcdef12-3456-7890-abcd-ef1234567890";
    const res = await app.request("/ping", {
      headers: { "x-request-id": id },
    });
    const body = await res.json();
    expect(body.traceId).toBe(id);
    expect(res.headers.get("x-trace-id")).toBe(id);
  });

  it("prefers x-trace-id over x-request-id", async () => {
    const app = createApp();
    const res = await app.request("/ping", {
      headers: {
        "x-trace-id": "018fc9c2-7a7e-4b7b-9c1a-2f3e4d5a6b7c",
        "x-request-id": "12345678",
      },
    });
    const body = await res.json();
    expect(body.traceId).toBe("018fc9c2-7a7e-4b7b-9c1a-2f3e4d5a6b7c");
  });

  it("sanitizes a garbage x-trace-id before it reaches handlers", async () => {
    const app = createApp();
    const res = await app.request("/ping", {
      headers: { "x-trace-id": "../../etc/passwd" },
    });
    const body = await res.json();
    expect(body.traceId).not.toBe("../../etc/passwd");
    expect(VALID_RE.test(body.traceId)).toBe(true);
    expect(res.headers.get("x-trace-id")).toBe(body.traceId);
  });

  it("sanitizes a 10KB x-trace-id before it reaches handlers", async () => {
    const app = createApp();
    const res = await app.request("/ping", {
      headers: { "x-trace-id": "0".repeat(10_000) },
    });
    const body = await res.json();
    expect(body.traceId.length).toBeLessThan(65);
    expect(VALID_RE.test(body.traceId)).toBe(true);
  });

  it("generates a UUID when no trace header is present", async () => {
    const app = createApp();
    const res = await app.request("/ping");
    const body = await res.json();
    expect(VALID_RE.test(body.traceId)).toBe(true);
    expect(res.headers.get("x-trace-id")).toBe(body.traceId);
  });

  it("sanitizes an empty x-trace-id by ignoring it", async () => {
    const app = createApp();
    const res = await app.request("/ping", {
      headers: { "x-trace-id": "" },
    });
    const body = await res.json();
    expect(VALID_RE.test(body.traceId)).toBe(true);
    expect(body.traceId).not.toBe("");
  });

  it("generates a fresh id per request when no header is supplied", async () => {
    const app = createApp();
    const a = await app.request("/ping");
    const b = await app.request("/ping");
    const aBody = await a.json();
    const bBody = await b.json();
    expect(aBody.traceId).not.toBe(bBody.traceId);
  });
});
