import { describe, it, expect, vi, beforeEach } from "vitest";
import { HTTPException } from "hono/http-exception";

// Mock prisma
vi.mock("../../../lib/db", () => ({
  prisma: {
    application: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock auth
vi.mock("../../../lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

import { prisma } from "../../../lib/db";
import { auth } from "../../../lib/auth";

const mockPrisma = vi.mocked(prisma);
const mockAuth = vi.mocked(auth);

// Helper to create a mock Hono app for a route
async function testRoute(
  route: any,
  options: {
    method: string;
    path: string;
    body?: any;
    query?: Record<string, string>;
    params?: Record<string, string>;
    headers?: Record<string, string>;
  },
  { withAuth = true } = {},
) {
  // Create a minimal Hono app with the route
  const { OpenAPIHono } = await import("@hono/zod-openapi");
  const app = new OpenAPIHono();

  // JSON error handler (matches production behavior)
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(
        { code: err.status, message: err.message },
        err.status as any,
      );
    }
    return c.json({ code: 500, message: "Internal Server Error" }, 500);
  });

  // Admin middleware (same as application/index.ts)
  if (withAuth) {
    app.use("*", async (c, next) => {
      const session = await mockAuth.api.getSession({
        headers: c.req.raw.headers,
      });
      if (!session?.user || session.user.role !== "admin") {
        throw new HTTPException(401, { message: "Admin access required" });
      }
      return next();
    });
  }

  app.openapi(route.route, route.handler);

  const url = new URL(
    `http://localhost${options.path}${options.query ? `?${new URLSearchParams(options.query).toString()}` : ""}`,
  );

  const req = new Request(url.toString(), {
    method: options.method,
    headers: {
      "content-type": "application/json",
      cookie: "session=test-session",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return app.request(req);
}

// ─── CREATE ────────────────────────────────────────────────────────────────

describe("POST / - Create Application", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.api.getSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    } as any);
  });

  it("returns 201 with application object for valid body", async () => {
    const now = new Date();
    mockPrisma.application.findFirst.mockResolvedValue(null);
    mockPrisma.application.create.mockResolvedValue({
      id: "app1",
      name: "OA System",
      code: "oa",
      description: "Office Automation",
      logo: null,
      sortOrder: 0,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const { createApplication } = await import("../createApplication");
    const res = await testRoute(createApplication, {
      method: "POST",
      path: "/",
      body: { name: "OA System", code: "oa", description: "Office Automation" },
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toMatchObject({
      id: "app1",
      name: "OA System",
      code: "oa",
    });
    expect(data.createdAt).toBeDefined();
  });

  it("returns 409 for duplicate code (non-deleted)", async () => {
    mockPrisma.application.findFirst.mockResolvedValue({
      id: "existing",
      code: "oa",
    });

    const { createApplication } = await import("../createApplication");
    const res = await testRoute(createApplication, {
      method: "POST",
      path: "/",
      body: { name: "Another OA", code: "oa" },
    });

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.message).toBe("Application code already exists");
  });

  it("returns 401 without admin session", async () => {
    mockAuth.api.getSession.mockResolvedValue(null);

    const { createApplication } = await import("../createApplication");
    const res = await testRoute(createApplication, {
      method: "POST",
      path: "/",
      body: { name: "Test", code: "test" },
      headers: { cookie: "" },
    });

    expect(res.status).toBe(401);
  });
});

// ─── LIST ──────────────────────────────────────────────────────────────────

describe("GET / - List Applications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.api.getSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    } as any);
  });

  it("returns applications with deletedAt: null filter", async () => {
    const apps = [
      { id: "a1", name: "App1", code: "app1", deletedAt: null },
      { id: "a2", name: "App2", code: "app2", deletedAt: null },
    ];
    mockPrisma.application.findMany.mockResolvedValue(apps as any);
    mockPrisma.application.count.mockResolvedValue(2);

    const { listApplications } = await import("../listApplications");
    const res = await testRoute(listApplications, {
      method: "GET",
      path: "/",
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.applications).toHaveLength(2);
    expect(data.total).toBe(2);

    // Verify deletedAt: null filter was used
    const findManyCall = mockPrisma.application.findMany.mock.calls[0][0];
    expect(findManyCall.where.deletedAt).toBeNull();
  });

  it("returns filtered results with search (case-insensitive)", async () => {
    mockPrisma.application.findMany.mockResolvedValue([
      { id: "a1", name: "OA System", code: "oa", deletedAt: null },
    ] as any);
    mockPrisma.application.count.mockResolvedValue(1);

    const { listApplications } = await import("../listApplications");
    const res = await testRoute(listApplications, {
      method: "GET",
      path: "/",
      query: { search: "oa" },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.applications).toHaveLength(1);

    // Verify OR search filter was built
    const findManyCall = mockPrisma.application.findMany.mock.calls[0][0];
    expect(findManyCall.where.OR).toBeDefined();
    expect(findManyCall.where.OR).toHaveLength(3);
  });

  it("returns 401 without admin session", async () => {
    mockAuth.api.getSession.mockResolvedValue(null);

    const { listApplications } = await import("../listApplications");
    const res = await testRoute(listApplications, {
      method: "GET",
      path: "/",
      headers: { cookie: "" },
    });

    expect(res.status).toBe(401);
  });
});

// ─── GET BY ID ─────────────────────────────────────────────────────────────

describe("GET /{id} - Get Application", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.api.getSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    } as any);
  });

  it("returns application for existing non-deleted app", async () => {
    mockPrisma.application.findFirst.mockResolvedValue({
      id: "app1",
      name: "OA",
      code: "oa",
      deletedAt: null,
    });

    const { getApplication } = await import("../getApplication");
    const res = await testRoute(getApplication, {
      method: "GET",
      path: "/app1",
      params: { id: "app1" },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("app1");

    // Verify findFirst with deletedAt: null
    const call = mockPrisma.application.findFirst.mock.calls[0][0];
    expect(call.where.deletedAt).toBeNull();
    expect(call.where.id).toBe("app1");
  });

  it("returns 404 for non-existent or deleted app", async () => {
    mockPrisma.application.findFirst.mockResolvedValue(null);

    const { getApplication } = await import("../getApplication");
    const res = await testRoute(getApplication, {
      method: "GET",
      path: "/nonexistent",
      params: { id: "nonexistent" },
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without admin session", async () => {
    mockAuth.api.getSession.mockResolvedValue(null);

    const { getApplication } = await import("../getApplication");
    const res = await testRoute(getApplication, {
      method: "GET",
      path: "/app1",
      params: { id: "app1" },
      headers: { cookie: "" },
    });

    expect(res.status).toBe(401);
  });
});

// ─── UPDATE ────────────────────────────────────────────────────────────────

describe("PUT /{id} - Update Application", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.api.getSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    } as any);
  });

  it("returns 200 with updated application", async () => {
    mockPrisma.application.findFirst
      .mockResolvedValueOnce({
        id: "app1",
        name: "OA",
        code: "oa",
        deletedAt: null,
      })
      .mockResolvedValueOnce(null); // code uniqueness check

    mockPrisma.application.update.mockResolvedValue({
      id: "app1",
      name: "Updated OA",
      code: "oa",
      deletedAt: null,
    });

    const { updateApplication } = await import("../updateApplication");
    const res = await testRoute(updateApplication, {
      method: "PUT",
      path: "/app1",
      params: { id: "app1" },
      body: { name: "Updated OA" },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Updated OA");
  });

  it("returns 409 when code conflicts with another app", async () => {
    mockPrisma.application.findFirst
      .mockResolvedValueOnce({
        id: "app1",
        name: "OA",
        code: "oa",
        deletedAt: null,
      })
      .mockResolvedValueOnce({
        id: "app2",
        code: "crm",
        deletedAt: null,
      }); // code already taken

    const { updateApplication } = await import("../updateApplication");
    const res = await testRoute(updateApplication, {
      method: "PUT",
      path: "/app1",
      params: { id: "app1" },
      body: { code: "crm" },
    });

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.message).toBe("Application code already exists");
  });

  it("returns 404 for non-existent app", async () => {
    mockPrisma.application.findFirst.mockResolvedValue(null);

    const { updateApplication } = await import("../updateApplication");
    const res = await testRoute(updateApplication, {
      method: "PUT",
      path: "/nonexistent",
      params: { id: "nonexistent" },
      body: { name: "Test" },
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without admin session", async () => {
    mockAuth.api.getSession.mockResolvedValue(null);

    const { updateApplication } = await import("../updateApplication");
    const res = await testRoute(updateApplication, {
      method: "PUT",
      path: "/app1",
      params: { id: "app1" },
      body: { name: "Test" },
      headers: { cookie: "" },
    });

    expect(res.status).toBe(401);
  });
});

// ─── DELETE ────────────────────────────────────────────────────────────────

describe("DELETE /{id} - Delete Application (soft delete)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.api.getSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    } as any);
  });

  it("returns {success: true} and sets deletedAt (soft delete)", async () => {
    const now = new Date();
    mockPrisma.application.findFirst.mockResolvedValue({
      id: "app1",
      deletedAt: null,
    });
    mockPrisma.application.update.mockResolvedValue({
      id: "app1",
      deletedAt: now,
    });

    const { deleteApplication } = await import("../deleteApplication");
    const res = await testRoute(deleteApplication, {
      method: "DELETE",
      path: "/app1",
      params: { id: "app1" },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify soft delete (update, not delete)
    expect(mockPrisma.application.update).toHaveBeenCalledWith({
      where: { id: "app1" },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("returns 404 for non-existent app", async () => {
    mockPrisma.application.findFirst.mockResolvedValue(null);

    const { deleteApplication } = await import("../deleteApplication");
    const res = await testRoute(deleteApplication, {
      method: "DELETE",
      path: "/nonexistent",
      params: { id: "nonexistent" },
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without admin session", async () => {
    mockAuth.api.getSession.mockResolvedValue(null);

    const { deleteApplication } = await import("../deleteApplication");
    const res = await testRoute(deleteApplication, {
      method: "DELETE",
      path: "/app1",
      params: { id: "app1" },
      headers: { cookie: "" },
    });

    expect(res.status).toBe(401);
  });
});
