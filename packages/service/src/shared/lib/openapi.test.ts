import {
  createRoute,
  defineOpenAPIRoute,
  OpenAPIHono,
  z,
} from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireSession } from "#extractors/session";
import { serializeHTTPException } from "#lib/http-error";
import { assertPermission } from "#modules/access-control/public";
import { prepend } from "#utils/list";
import { forbiddenResponse, unauthorizedResponse } from "./openapi";

vi.mock("#lib/session", () => ({
  getSessionFromHeaders: vi.fn(),
}));

vi.mock("#modules/access-control/public", () => ({
  assertPermission: vi.fn(),
}));

import { getSessionFromHeaders } from "#lib/session";

const mockGetSession = vi.mocked(getSessionFromHeaders);
const mockAssertPermission = vi.mocked(assertPermission);

const permissionRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/permission-required",
    tags: ["Test"],
    summary: "Permission-required test route",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      200: {
        content: {
          "application/json": {
            schema: z.object({ ok: z.literal(true) }),
          },
        },
        description: "OK",
      },
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    await assertPermission(session.user.id, "test::view");
    return c.json({ ok: true as const }, 200);
  },
});

const requireCustomAuth = createMiddleware(async (c, next) => {
  if (c.req.header("authorization") !== "Bearer valid-token") {
    throw new HTTPException(401, { message: "Custom auth required" });
  }
  return next();
});

const customProtectedRoute = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requireCustomAuth),
    method: "get",
    path: "/custom-protected",
    tags: ["Test"],
    summary: "Custom protected test route",
    responses: {
      ...unauthorizedResponse,
      200: {
        content: {
          "application/json": {
            schema: z.object({ ok: z.literal(true) }),
          },
        },
        description: "OK",
      },
    },
  }),
  handler: (c) => c.json({ ok: true as const }, 200),
});

function createTestApp() {
  const app = new OpenAPIHono();

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(serializeHTTPException(err), err.status);
    }
    return c.json({ code: 500, message: "Internal Server Error" }, 500);
  });

  app.openapi(permissionRoute.route, permissionRoute.handler);
  app.openapi(customProtectedRoute.route, customProtectedRoute.handler);
  return app;
}

describe("protected route composition", () => {
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

describe("permission route composition", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("allows a user with the required permission", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1" },
      session: { id: "session-1" },
    } as Awaited<ReturnType<typeof getSessionFromHeaders>>);
    mockAssertPermission.mockResolvedValue(undefined);

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
    } as Awaited<ReturnType<typeof getSessionFromHeaders>>);
    mockAssertPermission.mockRejectedValue(
      new HTTPException(403, { message: "Permission denied" }),
    );

    const res = await createTestApp().request("/permission-required");

    expect(res.status).toBe(403);
  });
});
