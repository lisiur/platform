import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, mountRoute } from "../../../../../test/helpers/app";
import { mockPrisma } from "../../../../../test/helpers/prisma";
import {
  authedSessionFn,
  mockSession,
} from "../../../../../test/helpers/session";

vi.mock("#lib/db", () => ({ prisma: mockPrisma().prisma }));
vi.mock("#lib/session", () => ({ getSessionFromHeaders: authedSessionFn() }));

import { prisma } from "#lib/db";
import { getSessionFromHeaders } from "#lib/session";
import { activateOrganization } from "../activateOrganization";

const db = prisma as unknown as {
  member: { findFirst: ReturnType<typeof vi.fn> };
  auditLog: { create: ReturnType<typeof vi.fn> };
  session: { update: ReturnType<typeof vi.fn> };
};

describe("POST /:id/activate - Activate Organization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSessionFromHeaders).mockResolvedValue(mockSession());
    db.auditLog.create.mockResolvedValue({});
    db.session.update.mockResolvedValue({});
  });

  it("activates the organization for a member and updates the session", async () => {
    db.member.findFirst.mockResolvedValue({ id: "member1" });

    const res = await mountRoute(activateOrganization).request(
      jsonRequest("/org1/activate", {
        method: "POST",
        cookie: "session=test-session",
      }),
    );

    expect(res.status).toBe(200);
    expect(db.member.findFirst).toHaveBeenCalledWith({
      where: { userId: "user1", organizationId: "org1" },
    });
    expect(db.session.update).toHaveBeenCalledWith({
      where: { id: "session1" },
      data: { activeOrganizationId: "org1" },
    });
    await expect(res.json()).resolves.toMatchObject({ success: true });
  });

  it("returns 403 when the user is not a member", async () => {
    db.member.findFirst.mockResolvedValue(null);

    const res = await mountRoute(activateOrganization).request(
      jsonRequest("/org1/activate", {
        method: "POST",
        cookie: "session=test-session",
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      message: "You are not a member of this organization",
    });
    expect(db.session.update).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    vi.mocked(getSessionFromHeaders).mockResolvedValue(null);

    const res = await mountRoute(activateOrganization).request(
      jsonRequest("/org1/activate", { method: "POST", cookie: "" }),
    );

    expect(res.status).toBe(401);
    expect(db.session.update).not.toHaveBeenCalled();
  });
});
