import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../services/upload.service", () => ({
  getFileAccess: vi.fn(),
}));

import { getFileAccess } from "../../../services/upload.service";

const mockGetFileAccess = vi.mocked(getFileAccess);

function mkStream(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

async function testRoute(options: {
  path: string;
  headers?: Record<string, string>;
}) {
  const { OpenAPIHono } = await import("@hono/zod-openapi");
  const { getFile } = await import("../getFile");

  const app = new OpenAPIHono();
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ code: err.status, message: err.message }, err.status);
    }
    return c.json({ code: 500, message: "Internal Server Error" }, 500);
  });
  app.openapi(getFile.route, getFile.handler);

  const req = new Request(`http://localhost${options.path}`, {
    method: "GET",
    headers: options.headers,
  });
  return app.request(req);
}

describe("GET /{id} - getFile SVG XSS mitigation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("serves SVG with a strict Content-Security-Policy and inline disposition", async () => {
    mockGetFileAccess.mockResolvedValue({
      stream: mkStream(),
      path: "public/aa/bb/aabb.svg",
      mimeType: "image/svg+xml",
      size: 100,
      visibility: "public",
    });

    const res = await testRoute({ path: "/svg-1" });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Content-Disposition")).toBe("inline");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'; base-uri 'none'",
    );
  });

  it("does not set CSP on raster image types", async () => {
    mockGetFileAccess.mockResolvedValue({
      stream: mkStream(),
      path: "public/aa/bb/aabb.png",
      mimeType: "image/png",
      size: 100,
      visibility: "public",
    });

    const res = await testRoute({ path: "/png-1" });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe("inline");
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("serves non-image types as attachment with no CSP", async () => {
    mockGetFileAccess.mockResolvedValue({
      stream: mkStream(),
      path: "private/aa/bb/aabb.pdf",
      mimeType: "application/pdf",
      size: 100,
      visibility: "private",
    });

    const res = await testRoute({ path: "/pdf-1" });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe("attachment");
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("returns 304 when If-None-Match matches the path etag", async () => {
    mockGetFileAccess.mockResolvedValue({
      stream: mkStream(),
      path: "public/aa/bb/aabb.svg",
      mimeType: "image/svg+xml",
      size: 100,
      visibility: "public",
    });

    const res = await testRoute({
      path: "/svg-1",
      headers: { "If-None-Match": '"public/aa/bb/aabb.svg"' },
    });

    expect(res.status).toBe(304);
    expect(res.headers.get("ETag")).toBe('"public/aa/bb/aabb.svg"');
  });
});
