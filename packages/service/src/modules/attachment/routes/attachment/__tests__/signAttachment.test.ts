import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { serializeHTTPException } from "#lib/http-error";

vi.mock("#modules/attachment/attachment.service", () => ({
  signFile: vi.fn(),
}));

vi.mock("#extractors/session", () => ({
  requirePrincipal: vi.fn(),
  getPrincipalUserId: vi.fn(),
}));

import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { signFile } from "#modules/attachment/attachment.service";

const mockRequirePrincipal = vi.mocked(requirePrincipal);
const mockGetPrincipalUserId = vi.mocked(getPrincipalUserId);
const mockSignFile = vi.mocked(signFile);

function mkUserPrincipal(userId: string) {
  const now = new Date();
  return {
    kind: "user" as const,
    user: {
      id: userId,
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      flags: [],
      createdAt: now,
      updatedAt: now,
    },
    session: {
      id: "session1",
      expiresAt: new Date(now.getTime() + 60_000),
      token: "session-token",
      userId,
      activeOrganizationId: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function testRoute(options: { path?: string } = {}) {
  const { OpenAPIHono } = await import("@hono/zod-openapi");
  const { signAttachment } = await import("../signAttachment");

  const app = new OpenAPIHono();
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(serializeHTTPException(err), err.status);
    }
    return c.json({ code: 500, message: "Internal Server Error" }, 500);
  });
  app.openapi(signAttachment.route, signAttachment.handler);

  const req = new Request(
    `http://localhost${options.path ?? "/attachment1/sign"}`,
    {
      method: "POST",
    },
  );
  return app.request(req);
}

describe("POST /{id}/sign - signAttachment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when no principal is present", async () => {
    mockRequirePrincipal.mockRejectedValue(
      new HTTPException(401, { message: "Unauthorized" }),
    );

    const res = await testRoute();

    expect(res.status).toBe(401);
    expect(mockSignFile).not.toHaveBeenCalled();
  });

  it("signs for the authenticated principal's user id", async () => {
    mockRequirePrincipal.mockResolvedValue(mkUserPrincipal("user1"));
    mockGetPrincipalUserId.mockReturnValue("user1");
    mockSignFile.mockResolvedValue({
      url: "/api/attachment/attachment1?token=abc&expires=1716000000000",
      expiresAt: new Date(1716000000000),
    });

    const res = await testRoute({ path: "/attachment1/sign" });

    expect(res.status).toBe(200);
    expect(mockSignFile).toHaveBeenCalledWith({
      id: "attachment1",
      userId: "user1",
    });
    await expect(res.json()).resolves.toMatchObject({
      url: "/api/attachment/attachment1?token=abc&expires=1716000000000",
    });
  });

  it("propagates ownership failures from the service", async () => {
    mockRequirePrincipal.mockResolvedValue(mkUserPrincipal("user1"));
    mockGetPrincipalUserId.mockReturnValue("user1");
    mockSignFile.mockRejectedValue(
      new HTTPException(403, { message: "Not file owner" }),
    );

    const res = await testRoute({ path: "/someone-elses/sign" });

    expect(res.status).toBe(403);
  });
});
