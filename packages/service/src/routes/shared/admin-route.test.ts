import { OpenAPIHono, z } from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAdminRoute, defineProtectedRoute } from "./admin-route";

vi.mock("#services/auth.service", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "#services/auth.service";

const mockGetSession = vi.mocked(getSession);

const testRoute = defineAdminRoute({
  route: {
    method: "get",
    path: "/admin-only",
    tags: ["Test"],
    summary: "Admin-only test route",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({ ok: z.literal(true) }),
          },
        },
        description: "OK",
      },
    },
  },
  handler: (c) => c.json({ ok: true as const }, 200),
});

const requireCustomAuth = createMiddleware(async (c, next) => {
  if (c.req.header("authorization") !== "Bearer valid-token") {
    throw new HTTPException(401, { message: "Custom auth required" });
  }
  return next();
});

const customProtectedRoute = defineProtectedRoute(
  {
    route: {
      method: "get",
      path: "/custom-protected",
      tags: ["Test"],
      summary: "Custom protected test route",
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.object({ ok: z.literal(true) }),
            },
          },
          description: "OK",
        },
      },
    },
    handler: (c) => c.json({ ok: true as const }, 200),
  },
  { middleware: requireCustomAuth },
);

function createTestApp() {
  const app = new OpenAPIHono();

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ code: err.status, message: err.message }, err.status);
    }
    return c.json({ code: 500, message: "Internal Server Error" }, 500);
  });

  app.openapi(testRoute.route, testRoute.handler);
  app.openapi(customProtectedRoute.route, customProtectedRoute.handler);
  return app;
}

describe("defineProtectedRoute", () => {
  it("allows callers to provide custom auth middleware", async () => {
    const res = await createTestApp().request("/custom-protected", {
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("adds the standard unauthorized response for custom auth middleware", async () => {
    const res = await createTestApp().request("/custom-protected");

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      code: 401,
      message: "Custom auth required",
    });
  });
});

describe("defineAdminRoute", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("allows an authenticated admin user", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", role: "admin" },
      session: { id: "session-1" },
    } as Awaited<ReturnType<typeof getSession>>);

    const res = await createTestApp().request("/admin-only");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("returns the standard unauthorized response for anonymous users", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await createTestApp().request("/admin-only");

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      code: 401,
      message: "Admin access required",
    });
  });

  it("returns the standard unauthorized response for non-admin users", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", role: "user" },
      session: { id: "session-1" },
    } as Awaited<ReturnType<typeof getSession>>);

    const res = await createTestApp().request("/admin-only");

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      code: 401,
      message: "Admin access required",
    });
  });
});
