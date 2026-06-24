import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/db", () => ({
  prisma: {
    member: {
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    session: {
      update: vi.fn(),
    },
  },
}));

vi.mock("../../../lib/session", () => ({
  getSessionFromHeaders: vi.fn(),
}));

import { prisma } from "../../../lib/db";
import { getSessionFromHeaders } from "../../../lib/session";
import { activateOrganization } from "../activateOrganization";

const mockPrisma = prisma as unknown as {
  member: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  auditLog: {
    create: ReturnType<typeof vi.fn>;
  };
  session: {
    update: ReturnType<typeof vi.fn>;
  };
};
const mockGetSession = vi.mocked(getSessionFromHeaders);

async function testRoute(options: { id?: string; headers?: HeadersInit }) {
  const app = new OpenAPIHono();

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(
        { code: err.status, message: err.message },
        err.status as never,
      );
    }
    return c.json({ code: 500, message: "Internal Server Error" }, 500);
  });

  app.openapi(activateOrganization.route, activateOrganization.handler);

  const id = options.id ?? "org1";
  return app.request(
    new Request(`http://localhost/${id}/activate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "session=test-session",
        ...options.headers,
      },
    }),
  );
}

describe("POST /:id/activate - Activate Organization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetSession.mockResolvedValue({
      user: { id: "user1", name: "User" },
      session: { id: "session1" },
    } as never);
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.session.update.mockResolvedValue({});
  });

  it("activates the organization for a member and updates the session", async () => {
    mockPrisma.member.findFirst.mockResolvedValue({ id: "member1" });

    const res = await testRoute({ id: "org1" });

    expect(res.status).toBe(200);
    expect(mockPrisma.member.findFirst).toHaveBeenCalledWith({
      where: { userId: "user1", organizationId: "org1" },
    });
    expect(mockPrisma.session.update).toHaveBeenCalledWith({
      where: { id: "session1" },
      data: { activeOrganizationId: "org1" },
    });
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  it("returns 403 when the user is not a member", async () => {
    mockPrisma.member.findFirst.mockResolvedValue(null);

    const res = await testRoute({ id: "org1" });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      message: "You are not a member of this organization",
    });
    expect(mockPrisma.session.update).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await testRoute({ headers: { cookie: "" } });

    expect(res.status).toBe(401);
    expect(mockPrisma.session.update).not.toHaveBeenCalled();
  });
});
