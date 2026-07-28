import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { serializeHTTPException } from "#lib/http-error";

// Mock prisma
vi.mock("../../../lib/db", () => ({
  prisma: {
    application: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

// Mock session extraction
vi.mock("../../../lib/session", () => ({
  getSessionFromHeaders: vi.fn(),
  getBearerToken: vi.fn(),
}));

vi.mock("../../../lib/api-token", () => ({
  getApiTokenByBearer: vi.fn(),
}));

// Mock role-permission
vi.mock("../../../services/role-permission.service", () => ({
  assertAccess: vi.fn(),
  assertPermission: vi.fn(),
  getUserPermissions: vi.fn(),
}));

import { getApiTokenByBearer } from "../../../lib/api-token";
import { prisma } from "../../../lib/db";
import { getSessionFromHeaders } from "../../../lib/session";
import {
  assertAccess,
  assertPermission,
  getUserPermissions,
} from "../../../services/role-permission.service";

const mockPrisma = prisma as unknown as {
  application: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  auditLog: {
    create: ReturnType<typeof vi.fn>;
  };
};
const mockGetSession = vi.mocked(getSessionFromHeaders);
const mockGetApiTokenByBearer = vi.mocked(getApiTokenByBearer);
const mockAssertAccess = vi.mocked(assertAccess);
const _mockAssertPermission = vi.mocked(assertPermission);
const mockGetUserPermissions = vi.mocked(getUserPermissions);

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
) {
  mockAssertAccess.mockResolvedValue(undefined);

  // Create a minimal Hono app with the route
  const { OpenAPIHono } = await import("@hono/zod-openapi");
  const app = new OpenAPIHono();

  // JSON error handler (matches production behavior)
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(serializeHTTPException(err), err.status as any);
    }
    return c.json({ code: 500, message: "Internal Server Error" }, 500);
  });

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

// ─── CURRENT ────────────────────────────────────────────────────────────────

describe("GET /current - Current Application", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetSession.mockResolvedValue({
      user: { id: "u1" },
      session: { id: "s1" },
    } as any);
    mockGetApiTokenByBearer.mockResolvedValue(null);
    mockGetUserPermissions.mockResolvedValue([]);
  });

  it("returns a restricted current application for authenticated users without application::view", async () => {
    const now = new Date();
    mockPrisma.application.findFirst.mockResolvedValue({
      id: "app1",
      name: "Organization",
      code: "organization",
      description: "Organization workspace",
      logo: "/api/upload/logo1",
      sortOrder: 10,
      createdAt: now,
      updatedAt: now,
    });

    const { getCurrentApplication } = await import("../getCurrentApplication");
    const res = await testRoute(getCurrentApplication, {
      method: "GET",
      path: "/current",
      headers: { "X-App-Code": "organization" },
    });

    expect(res.status).toBe(200);
    expect(mockGetUserPermissions).not.toHaveBeenCalled();
    expect(mockPrisma.application.findFirst).toHaveBeenCalledWith({
      where: { code: "organization" },
    });
    await expect(res.json()).resolves.toEqual({
      name: "Organization",
      code: "organization",
      description: "Organization workspace",
      logo: "/api/upload/logo1",
    });
  });

  it("returns the current application without a session (public)", async () => {
    const now = new Date();
    mockGetSession.mockResolvedValue(null);
    mockPrisma.application.findFirst.mockResolvedValue({
      id: "app1",
      name: "Organization",
      code: "organization",
      description: "Organization workspace",
      logo: "/api/upload/logo1",
      sortOrder: 10,
      createdAt: now,
      updatedAt: now,
    });

    const { getCurrentApplication } = await import("../getCurrentApplication");
    const res = await testRoute(getCurrentApplication, {
      method: "GET",
      path: "/current",
      headers: { "X-App-Code": "organization", cookie: "" },
    });

    expect(res.status).toBe(200);
    expect(mockPrisma.application.findFirst).toHaveBeenCalledWith({
      where: { code: "organization" },
    });
    await expect(res.json()).resolves.toEqual({
      name: "Organization",
      code: "organization",
      description: "Organization workspace",
      logo: "/api/upload/logo1",
    });
  });

  it("returns 400 without X-App-Code", async () => {
    const { getCurrentApplication } = await import("../getCurrentApplication");
    const res = await testRoute(getCurrentApplication, {
      method: "GET",
      path: "/current",
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      message: "Missing X-App-Code header",
    });
    expect(mockPrisma.application.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown X-App-Code", async () => {
    mockPrisma.application.findFirst.mockResolvedValue(null);

    const { getCurrentApplication } = await import("../getCurrentApplication");
    const res = await testRoute(getCurrentApplication, {
      method: "GET",
      path: "/current",
      headers: { "X-App-Code": "missing" },
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      message: "Application not found: missing",
    });
  });
});

// ─── LIST ──────────────────────────────────────────────────────────────────

describe("GET / - List Applications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetSession.mockResolvedValue({
      user: { id: "u1" },
      session: { id: "s1" },
    } as any);
    mockGetUserPermissions.mockResolvedValue(["*"]);
  });

  it("returns applications", async () => {
    const apps = [
      { id: "a1", name: "App1", code: "app1" },
      { id: "a2", name: "App2", code: "app2" },
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
  });

  it("returns filtered results with search (case-insensitive)", async () => {
    mockPrisma.application.findMany.mockResolvedValue([
      { id: "a1", name: "OA System", code: "oa" },
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
    mockGetSession.mockResolvedValue(null);

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
    mockGetSession.mockResolvedValue({
      user: { id: "u1" },
      session: { id: "s1" },
    } as any);
    mockGetUserPermissions.mockResolvedValue(["*"]);
  });

  it("returns application for existing app", async () => {
    mockPrisma.application.findFirst.mockResolvedValue({
      id: "app1",
      name: "OA",
      code: "oa",
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

    const call = mockPrisma.application.findFirst.mock.calls[0][0];
    expect(call.where.id).toBe("app1");
  });

  it("returns 404 for non-existent app", async () => {
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
    mockGetSession.mockResolvedValue(null);

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
    mockGetSession.mockResolvedValue({
      user: { id: "u1" },
      session: { id: "s1" },
    } as any);
    mockGetUserPermissions.mockResolvedValue(["*"]);
  });

  it("returns 200 with updated application", async () => {
    mockPrisma.application.findFirst
      .mockResolvedValueOnce({
        id: "app1",
        name: "OA",
        code: "oa",
      })
      .mockResolvedValueOnce(null); // code uniqueness check

    mockPrisma.application.update.mockResolvedValue({
      id: "app1",
      name: "Updated OA",
      code: "oa",
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

  it("allows clearing logo with null", async () => {
    mockPrisma.application.findFirst.mockResolvedValue({
      id: "app1",
      name: "OA",
      code: "oa",
      logo: "/api/upload/upload1",
    });

    mockPrisma.application.update.mockResolvedValue({
      id: "app1",
      name: "OA",
      code: "oa",
      logo: null,
    });

    const { updateApplication } = await import("../updateApplication");
    const res = await testRoute(updateApplication, {
      method: "PUT",
      path: "/app1",
      params: { id: "app1" },
      body: { logo: null },
    });

    expect(res.status).toBe(200);
    expect(mockPrisma.application.update).toHaveBeenCalledWith({
      where: { id: "app1" },
      data: { logo: null },
    });
  });

  it("returns 409 when code conflicts with another app", async () => {
    mockPrisma.application.findFirst
      .mockResolvedValueOnce({
        id: "app1",
        name: "OA",
        code: "oa",
      })
      .mockResolvedValueOnce({
        id: "app2",
        code: "crm",
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
    mockGetSession.mockResolvedValue(null);

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
