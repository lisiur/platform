import { OpenAPIHono, z } from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { definePermissionRoute, defineProtectedRoute } from "./admin-route";

vi.mock("#services/auth.service", () => ({
  getSession: vi.fn(),
}));

vi.mock("#services/role-permission.service", () => ({
  getUserPermissions: vi.fn(),
}));

import { getSession } from "#services/auth.service";
import { getUserPermissions } from "#services/role-permission.service";

const mockGetSession = vi.mocked(getSession);
const mockGetUserPermissions = vi.mocked(getUserPermissions);

const permissionRoute = definePermissionRoute({
  route: {
    method: "get",
    path: "/permission-required",
    tags: ["Test"],
    summary: "Permission-required test route",
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
  permission: "test::view",
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

  app.openapi(permissionRoute.route, permissionRoute.handler);
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

describe("definePermissionRoute", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("allows a user with the required permission", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { id: "session-1" },
    } as Awaited<ReturnType<typeof getSession>>);
    mockGetUserPermissions.mockResolvedValue(["test::view"]);

    const res = await createTestApp().request("/permission-required");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("returns 401 for anonymous users", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await createTestApp().request("/permission-required");

    expect(res.status).toBe(401);
  });

  it("returns 403 for users without the required permission", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { id: "session-1" },
    } as Awaited<ReturnType<typeof getSession>>);
    mockGetUserPermissions.mockResolvedValue(["other::view"]);

    const res = await createTestApp().request("/permission-required");

    expect(res.status).toBe(403);
  });
});
