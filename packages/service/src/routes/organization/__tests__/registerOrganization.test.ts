import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
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
import { registerOrganization } from "../registerOrganization";

const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
  auditLog: {
    create: ReturnType<typeof vi.fn>;
  };
  session: {
    update: ReturnType<typeof vi.fn>;
  };
};
const mockGetSession = vi.mocked(getSessionFromHeaders);

const tx = {
  organization: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  member: {
    upsert: vi.fn(),
  },
  role: {
    findUnique: vi.fn(),
  },
  roleAssignment: {
    upsert: vi.fn(),
  },
};

async function testRoute(options: { body?: unknown; headers?: HeadersInit }) {
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

  app.openapi(registerOrganization.route, registerOrganization.handler);

  return app.request(
    new Request("http://localhost/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "session=test-session",
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
  );
}

describe("POST /register - Register Organization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetSession.mockResolvedValue({
      user: { id: "user1", name: "User" },
      session: { id: "session1" },
    } as never);
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.session.update.mockResolvedValue({});
  });

  it("creates an organization and owner member for the current user", async () => {
    const now = new Date();
    tx.organization.findUnique.mockResolvedValue(null);
    tx.organization.create.mockResolvedValue({
      id: "org1",
      name: "Acme Corp",
      slug: "acme-corp",
      logo: null,
      metadata: null,
      createdAt: now,
    });
    tx.member.upsert.mockResolvedValue({});
    tx.role.findUnique.mockResolvedValue({ id: "owner-role-id" });
    tx.roleAssignment.upsert.mockResolvedValue({});

    const res = await testRoute({
      body: { name: "Acme Corp", slug: "acme-corp" },
    });

    expect(res.status).toBe(201);
    expect(tx.organization.findUnique).toHaveBeenCalledWith({
      where: { slug: "acme-corp" },
    });
    expect(tx.organization.create).toHaveBeenCalledWith({
      data: {
        name: "Acme Corp",
        slug: "acme-corp",
        createdAt: expect.any(Date),
      },
    });
    expect(tx.member.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_userId: {
          organizationId: "org1",
          userId: "user1",
        },
      },
      update: {},
      create: {
        organizationId: "org1",
        userId: "user1",
        createdAt: expect.any(Date),
      },
    });
    expect(tx.role.findUnique).toHaveBeenCalledWith({
      where: {
        appId_scopeType_scopeId_code: {
          appId: "organization",
          scopeType: "PLATFORM",
          scopeId: "",
          code: "owner",
        },
      },
      select: { id: true },
    });
    expect(tx.roleAssignment.upsert).toHaveBeenCalledWith({
      where: {
        userId_roleId_scopeType_scopeId: {
          userId: "user1",
          roleId: "owner-role-id",
          scopeType: "ORGANIZATION",
          scopeId: "org1",
        },
      },
      update: {},
      create: {
        userId: "user1",
        roleId: "owner-role-id",
        scopeType: "ORGANIZATION",
        scopeId: "org1",
      },
    });
    expect(mockPrisma.session.update).toHaveBeenCalledWith({
      where: { id: "session1" },
      data: { activeOrganizationId: "org1" },
    });
    await expect(res.json()).resolves.toMatchObject({
      id: "org1",
      name: "Acme Corp",
      slug: "acme-corp",
    });
  });

  it("returns 409 when the slug is already taken", async () => {
    tx.organization.findUnique.mockResolvedValue({ id: "existing" });

    const res = await testRoute({
      body: { name: "Acme Corp", slug: "acme-corp" },
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      message: "Slug already taken",
    });
    expect(tx.organization.create).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await testRoute({
      body: { name: "Acme Corp", slug: "acme-corp" },
      headers: { cookie: "" },
    });

    expect(res.status).toBe(401);
    expect(tx.organization.create).not.toHaveBeenCalled();
  });
});
