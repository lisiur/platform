import { HTTPException } from "hono/http-exception";
import { sign } from "hono/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.QIANLAI_INVITE_SECRET = "test-invite-secret";

const { txUserCreate } = vi.hoisted(() => ({ txUserCreate: vi.fn() }));

vi.mock("#lib/db", () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: vi.fn(),
        ledgerMember: {},
        ledger: {},
        user: { create: txUserCreate },
      }),
    ),
  },
}));

vi.mock("../ledger.repository", () => ({
  ledgerRepository: {
    findById: vi.fn(),
    setOwner: vi.fn(),
    setDefault: vi.fn(),
  },
  lockLedgerRow: vi.fn(),
}));

vi.mock("../ledger-member.repository", () => ({
  ledgerMemberRepository: {
    findMembership: vi.fn(),
    create: vi.fn(),
    updateRole: vi.fn(),
    delete: vi.fn(),
    listByLedger: vi.fn(),
    countMembershipsByUser: vi.fn(),
  },
}));

vi.mock("../journal.repository", () => ({
  journalRepository: {
    countEntriesAnchoringUser: vi.fn(),
    countParticipationsByUser: vi.fn(),
  },
}));

vi.mock("../../identity/user-lookup.repository", () => ({
  userLookupRepository: {
    findFlagsById: vi.fn(),
    renameById: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock("../project.repository", () => ({
  projectRepository: {
    findById: vi.fn(),
  },
}));

vi.mock("../project-member.repository", () => ({
  projectMemberRepository: {
    findMembership: vi.fn(),
    create: vi.fn(),
    deleteAllInLedger: vi.fn(),
    listSharedMemberUserIds: vi.fn(),
  },
}));

import { verify } from "hono/jwt";
import { userLookupRepository } from "../../identity/user-lookup.repository";
import { INVITE_AUDIENCE, INVITE_TTL_SECONDS } from "../invite-token";
import { journalRepository } from "../journal.repository";
import { ledgerRepository } from "../ledger.repository";
import { ledgerMemberRepository } from "../ledger-member.repository";
import { projectRepository } from "../project.repository";
import { projectMemberRepository } from "../project-member.repository";
import {
  createShareCode,
  createVirtualMember,
  listMembers,
  MAX_VIRTUAL_MEMBERS_PER_LEDGER,
  redeemShareCode,
  removeMember,
  transferOwnership,
  updateMember,
} from "../share.service";

const mockLedgerRepo = ledgerRepository as unknown as {
  findById: ReturnType<typeof vi.fn>;
  setOwner: ReturnType<typeof vi.fn>;
  setDefault: ReturnType<typeof vi.fn>;
};
const mockMemberRepo = ledgerMemberRepository as unknown as {
  findMembership: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  updateRole: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  listByLedger: ReturnType<typeof vi.fn>;
  countMembershipsByUser: ReturnType<typeof vi.fn>;
};
const mockProjectRepo = projectRepository as unknown as {
  findById: ReturnType<typeof vi.fn>;
};
const mockProjectMemberRepo = projectMemberRepository as unknown as {
  findMembership: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  deleteAllInLedger: ReturnType<typeof vi.fn>;
  listSharedMemberUserIds: ReturnType<typeof vi.fn>;
};
const mockLookupRepo = userLookupRepository as unknown as {
  findFlagsById: ReturnType<typeof vi.fn>;
  renameById: ReturnType<typeof vi.fn>;
  deleteById: ReturnType<typeof vi.fn>;
};
const mockJournalRepo = journalRepository as unknown as {
  countEntriesAnchoringUser: ReturnType<typeof vi.fn>;
  countParticipationsByUser: ReturnType<typeof vi.fn>;
};

const baseLedger = {
  id: "led-1",
  ownerId: "user-owner",
  name: "Family",
  status: "active",
};

const SECRET = "test-invite-secret";

/** Signs an invite JWT with full control over claims (incl. bad ones). */
async function inviteToken(
  claims: Record<string, unknown>,
  secret: string = SECRET,
): Promise<string> {
  return sign({ aud: INVITE_AUDIENCE, ...claims }, secret);
}

function freshInviteToken(
  claims: Record<string, unknown> = {},
  secret: string = SECRET,
) {
  const now = Math.floor(Date.now() / 1000);
  return inviteToken(
    {
      sub: "user-owner",
      ledgerId: "led-1",
      role: "editor",
      iat: now,
      exp: now + INVITE_TTL_SECONDS,
      ...claims,
    },
    secret,
  );
}

async function expectStatus(
  fn: () => Promise<unknown>,
  status: number,
): Promise<void> {
  const err = await fn().catch((e) => e);
  expect(err).toBeInstanceOf(HTTPException);
  expect((err as HTTPException).status).toBe(status);
}

describe("redeemShareCode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue(baseLedger);
    mockMemberRepo.findMembership.mockResolvedValue(null);
    mockMemberRepo.create.mockResolvedValue({});
  });

  it("adds the redeemer as a member with the token's role", async () => {
    const result = await redeemShareCode(
      "user-b",
      await freshInviteToken({ role: "viewer" }),
    );
    expect(result).toEqual({ ledgerId: "led-1", role: "viewer" });
    expect(mockMemberRepo.create).toHaveBeenCalledWith(
      { ledgerId: "led-1", userId: "user-b", role: "viewer" },
      expect.anything(),
    );
  });

  it("project token: creates a guest membership plus the project member", async () => {
    mockProjectRepo.findById.mockResolvedValue({
      id: "proj-1",
      ledgerId: "led-1",
      status: "active",
    });
    mockProjectMemberRepo.findMembership.mockResolvedValue(null);
    mockProjectMemberRepo.create.mockResolvedValue({});
    const result = await redeemShareCode(
      "user-b",
      await freshInviteToken({ role: "guest", projectId: "proj-1" }),
    );
    expect(result).toEqual({
      ledgerId: "led-1",
      projectId: "proj-1",
      role: "guest",
    });
    expect(mockMemberRepo.create).toHaveBeenCalledWith(
      { ledgerId: "led-1", userId: "user-b", role: "guest" },
      expect.anything(),
    );
    expect(mockProjectMemberRepo.create).toHaveBeenCalledWith(
      { projectId: "proj-1", userId: "user-b" },
      expect.anything(),
    );
  });

  it("project token: an existing member only gains the project", async () => {
    mockProjectRepo.findById.mockResolvedValue({
      id: "proj-1",
      ledgerId: "led-1",
      status: "active",
    });
    mockMemberRepo.findMembership.mockResolvedValue({ role: "editor" });
    mockProjectMemberRepo.findMembership.mockResolvedValue(null);
    await redeemShareCode(
      "user-b",
      await freshInviteToken({ role: "guest", projectId: "proj-1" }),
    );
    expect(mockMemberRepo.create).not.toHaveBeenCalled();
    expect(mockProjectMemberRepo.create).toHaveBeenCalledWith(
      { projectId: "proj-1", userId: "user-b" },
      expect.anything(),
    );
  });

  it("project token: rejects an already-project-member (400)", async () => {
    mockProjectRepo.findById.mockResolvedValue({
      id: "proj-1",
      ledgerId: "led-1",
      status: "active",
    });
    mockProjectMemberRepo.findMembership.mockResolvedValue({ id: "pm-1" });
    await expectStatus(
      async () =>
        redeemShareCode(
          "user-b",
          await freshInviteToken({ role: "guest", projectId: "proj-1" }),
        ),
      400,
    );
    expect(mockProjectMemberRepo.create).not.toHaveBeenCalled();
  });

  it("rejects an expired token (400)", async () => {
    const token = await inviteToken({
      sub: "user-owner",
      ledgerId: "led-1",
      role: "editor",
      iat: 1,
      exp: 2,
    });
    await expectStatus(() => redeemShareCode("user-b", token), 400);
    expect(mockMemberRepo.create).not.toHaveBeenCalled();
  });

  it("rejects a token signed with the wrong secret (400)", async () => {
    const token = await freshInviteToken({}, "wrong-secret");
    await expectStatus(() => redeemShareCode("user-b", token), 400);
  });

  it("rejects a token with the wrong audience (400)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      {
        aud: "something-else",
        sub: "user-owner",
        ledgerId: "led-1",
        role: "editor",
        iat: now,
        exp: now + 60,
      },
      SECRET,
    );
    await expectStatus(() => redeemShareCode("user-b", token), 400);
  });

  it("rejects a guest role on a ledger-wide token (400)", async () => {
    const token = await freshInviteToken({ role: "guest" });
    await expectStatus(() => redeemShareCode("user-b", token), 400);
  });

  it("rejects garbage input (400)", async () => {
    await expectStatus(() => redeemShareCode("user-b", "NOPE"), 400);
  });

  it("rejects redemption of an archived ledger (400)", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      ...baseLedger,
      status: "archived",
    });
    await expectStatus(
      async () => redeemShareCode("user-b", await freshInviteToken()),
      400,
    );
  });

  it("rejects users who are already members (400)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-1",
      ledgerId: "led-1",
      userId: "user-b",
      role: "viewer",
    });
    await expectStatus(
      async () => redeemShareCode("user-b", await freshInviteToken()),
      400,
    );
    expect(mockMemberRepo.create).not.toHaveBeenCalled();
  });

  it("rejects the owner redeeming their own ledger (400)", async () => {
    await expectStatus(
      async () => redeemShareCode("user-owner", await freshInviteToken()),
      400,
    );
    expect(mockMemberRepo.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the ledger is deleted mid-redeem (race)", async () => {
    // The token verified, but a concurrent deleteLedger won the ledger row
    // lock and committed: the locked re-read finds nothing.
    mockLedgerRepo.findById.mockResolvedValue(null);
    await expectStatus(
      async () => redeemShareCode("user-b", await freshInviteToken()),
      404,
    );
    expect(mockMemberRepo.create).not.toHaveBeenCalled();
  });

  it("maps a foreign-key violation on the member insert to 404", async () => {
    // Defense-in-depth for paths the ledger row lock can't cover.
    mockMemberRepo.create.mockRejectedValue({ code: "P2003" });
    await expectStatus(
      async () => redeemShareCode("user-b", await freshInviteToken()),
      404,
    );
  });
});

describe("createShareCode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue(baseLedger);
  });

  it("mints a verifiable token bound to the ledger, creator, and role", async () => {
    const result = await createShareCode("led-1", "user-owner", {
      role: "viewer",
    });
    expect(result.ledgerId).toBe("led-1");
    expect(result.role).toBe("viewer");
    expect(result.projectId).toBeNull();
    const claims = await verify(result.code, SECRET, "HS256");
    expect(claims.aud).toBe(INVITE_AUDIENCE);
    expect(claims.sub).toBe("user-owner");
    expect(claims.ledgerId).toBe("led-1");
    expect(claims.role).toBe("viewer");
    expect(claims.projectId).toBeUndefined();
    // ~60s lifetime.
    expect((claims.exp as number) - (claims.iat as number)).toBe(
      INVITE_TTL_SECONDS,
    );
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("mints project invites scoped to the project", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "editor" });
    mockProjectRepo.findById.mockResolvedValue({
      id: "proj-1",
      ledgerId: "led-1",
      status: "active",
    });
    const result = await createShareCode("led-1", "user-editor", {
      role: "guest",
      projectId: "proj-1",
    });
    expect(result.projectId).toBe("proj-1");
    const claims = await verify(result.code, SECRET, "HS256");
    expect(claims.projectId).toBe("proj-1");
    expect(claims.role).toBe("guest");
  });

  it("rejects a non-guest role on a project invite (400)", async () => {
    await expectStatus(
      async () =>
        createShareCode("led-1", "user-owner", {
          role: "editor",
          projectId: "proj-1",
        }),
      400,
    );
  });

  it("rejects a ledger-wide guest invite (400)", async () => {
    await expectStatus(
      () => createShareCode("led-1", "user-owner", { role: "guest" }),
      400,
    );
  });

  it("requires editor+ for project invites (403)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "viewer" });
    await expectStatus(
      async () =>
        createShareCode("led-1", "user-viewer", {
          role: "guest",
          projectId: "proj-1",
        }),
      403,
    );
  });

  it("requires the owner for ledger-wide invites (403)", async () => {
    await expectStatus(
      () => createShareCode("led-1", "user-other", { role: "viewer" }),
      403,
    );
  });

  it("rejects an invite for a ledger archived after the route's check (race, 400)", async () => {
    // The route's assertLedgerWritable saw an active ledger; a concurrent
    // archive won the row lock first and the under-lock re-read sees archived.
    mockLedgerRepo.findById.mockResolvedValue({
      ...baseLedger,
      status: "archived",
    });
    await expectStatus(
      () => createShareCode("led-1", "user-owner", { role: "viewer" }),
      400,
    );
  });

  it("rejects an invite for a ledger transferred away after the route's check (race, 403)", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      ...baseLedger,
      ownerId: "user-other",
    });
    await expectStatus(
      () => createShareCode("led-1", "user-owner", { role: "viewer" }),
      403,
    );
  });

  it("returns 404 when the ledger is deleted mid-mint (race)", async () => {
    mockLedgerRepo.findById.mockResolvedValue(null);
    await expectStatus(
      () => createShareCode("led-1", "user-owner", { role: "viewer" }),
      404,
    );
  });
});

describe("updateMember", () => {
  const actorOwner = {
    id: "m-owner",
    ledgerId: "led-1",
    userId: "user-owner",
    role: "owner",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockMemberRepo.updateRole.mockResolvedValue({});
    mockLookupRepo.findFlagsById.mockResolvedValue({ flags: [] });
    mockLookupRepo.renameById.mockResolvedValue({});
  });

  it("updates the member's role (owner)", async () => {
    mockMemberRepo.findMembership
      .mockResolvedValueOnce(actorOwner)
      .mockResolvedValueOnce({
        id: "m-1",
        ledgerId: "led-1",
        userId: "user-b",
        role: "editor",
      });
    const result = await updateMember("led-1", "user-owner", "user-b", {
      role: "viewer",
    });
    expect(result).toEqual({ success: true });
    expect(mockMemberRepo.updateRole).toHaveBeenCalledWith(
      "led-1",
      "user-b",
      "viewer",
      expect.anything(),
    );
  });

  it("returns 403 when a non-owner changes a role", async () => {
    mockMemberRepo.findMembership
      .mockResolvedValueOnce({
        ...actorOwner,
        userId: "user-e",
        role: "editor",
      })
      .mockResolvedValueOnce({
        id: "m-1",
        ledgerId: "led-1",
        userId: "user-b",
        role: "viewer",
      });
    await expectStatus(
      () => updateMember("led-1", "user-e", "user-b", { role: "editor" }),
      403,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
  });

  it("returns 400 when the role is invalid", async () => {
    await expectStatus(
      () => updateMember("led-1", "user-owner", "user-b", { role: "owner" }),
      400,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
  });

  it("returns 400 when changing your own role", async () => {
    await expectStatus(
      () =>
        updateMember("led-1", "user-owner", "user-owner", { role: "viewer" }),
      400,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
  });

  it("returns 404 when the target is not a member", async () => {
    mockMemberRepo.findMembership
      .mockResolvedValueOnce(actorOwner)
      .mockResolvedValueOnce(null);
    await expectStatus(
      () => updateMember("led-1", "user-owner", "user-b", { role: "viewer" }),
      404,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
  });

  it("returns 400 when the target is the owner", async () => {
    mockMemberRepo.findMembership
      .mockResolvedValueOnce(actorOwner)
      .mockResolvedValueOnce({
        id: "m-owner",
        ledgerId: "led-1",
        userId: "user-b",
        role: "owner",
      });
    await expectStatus(
      () => updateMember("led-1", "user-owner", "user-b", { role: "viewer" }),
      400,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
  });

  it("returns 400 on an empty update", async () => {
    await expectStatus(
      () => updateMember("led-1", "user-owner", "user-b", {}),
      400,
    );
  });

  it("returns 400 when the body carries both a role and a name", async () => {
    await expectStatus(
      () =>
        updateMember("led-1", "user-owner", "user-v", {
          role: "editor",
          name: "小明",
        }),
      400,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
    expect(mockLookupRepo.renameById).not.toHaveBeenCalled();
  });

  it("renames a virtual member (editor+)", async () => {
    mockMemberRepo.findMembership
      .mockResolvedValueOnce({
        ...actorOwner,
        userId: "user-e",
        role: "editor",
      })
      .mockResolvedValueOnce({
        id: "m-1",
        ledgerId: "led-1",
        userId: "user-v",
        role: "viewer",
      });
    mockLookupRepo.findFlagsById.mockResolvedValue({
      flags: ["virtual"],
    });
    const result = await updateMember("led-1", "user-e", "user-v", {
      name: "小明",
    });
    expect(result).toEqual({ success: true });
    expect(mockLookupRepo.renameById).toHaveBeenCalledWith(
      "user-v",
      "小明",
      expect.anything(),
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
  });

  it("refuses to rename a real member (400)", async () => {
    mockMemberRepo.findMembership
      .mockResolvedValueOnce(actorOwner)
      .mockResolvedValueOnce({
        id: "m-1",
        ledgerId: "led-1",
        userId: "user-b",
        role: "editor",
      });
    await expectStatus(
      () => updateMember("led-1", "user-owner", "user-b", { name: "小明" }),
      400,
    );
    expect(mockLookupRepo.renameById).not.toHaveBeenCalled();
  });

  it("refuses to change a virtual member's role (400)", async () => {
    mockMemberRepo.findMembership
      .mockResolvedValueOnce(actorOwner)
      .mockResolvedValueOnce({
        id: "m-1",
        ledgerId: "led-1",
        userId: "user-v",
        role: "viewer",
      });
    mockLookupRepo.findFlagsById.mockResolvedValue({
      flags: ["virtual"],
    });
    await expectStatus(
      () => updateMember("led-1", "user-owner", "user-v", { role: "editor" }),
      400,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
  });
});

describe("createVirtualMember", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue(baseLedger);
    mockMemberRepo.create.mockResolvedValue({
      id: "m-v",
      ledgerId: "led-1",
      role: "viewer",
      createdAt: new Date("2024-01-01T00:00:00Z"),
    });
    txUserCreate.mockResolvedValue({
      id: "user-v",
      name: "小明",
      flags: ["virtual"],
    });
    mockMemberRepo.listByLedger.mockResolvedValue([]);
  });

  it("creates a flagged user plus a viewer membership", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-e",
      ledgerId: "led-1",
      userId: "user-e",
      role: "editor",
    });
    const result = await createVirtualMember("led-1", "user-e", "小明");
    expect(txUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: "小明", flags: ["virtual"] },
      }),
    );
    expect(mockMemberRepo.create).toHaveBeenCalledWith(
      { ledgerId: "led-1", userId: "user-v", role: "viewer" },
      expect.anything(),
    );
    expect(result.role).toBe("viewer");
    expect(result.userId).toBe("user-v");
    expect(result.user).toEqual({
      id: "user-v",
      name: "小明",
      email: null,
      avatar: null,
      isVirtual: true,
    });
  });

  it("is open to owners too", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-o",
      ledgerId: "led-1",
      userId: "user-owner",
      role: "owner",
    });
    const result = await createVirtualMember("led-1", "user-owner", "小明");
    expect(result.role).toBe("viewer");
  });

  it("requires editor+ (viewer → 403)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-vw",
      ledgerId: "led-1",
      userId: "user-vw",
      role: "viewer",
    });
    await expectStatus(
      () => createVirtualMember("led-1", "user-vw", "小明"),
      403,
    );
    expect(txUserCreate).not.toHaveBeenCalled();
  });

  it("requires editor+ (guest → 403)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-g",
      ledgerId: "led-1",
      userId: "user-g",
      role: "guest",
    });
    await expectStatus(
      () => createVirtualMember("led-1", "user-g", "小明"),
      403,
    );
  });

  it("rejects an archived ledger (400)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-e",
      ledgerId: "led-1",
      userId: "user-e",
      role: "editor",
    });
    mockLedgerRepo.findById.mockResolvedValue({
      ...baseLedger,
      status: "archived",
    });
    await expectStatus(
      () => createVirtualMember("led-1", "user-e", "小明"),
      400,
    );
  });

  it("returns 404 when the ledger is gone", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-e",
      ledgerId: "led-1",
      userId: "user-e",
      role: "editor",
    });
    mockLedgerRepo.findById.mockResolvedValue(null);
    await expectStatus(
      () => createVirtualMember("led-1", "user-e", "小明"),
      404,
    );
  });

  it("enforces the per-ledger virtual-member cap (400)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-e",
      ledgerId: "led-1",
      userId: "user-e",
      role: "editor",
    });
    mockMemberRepo.listByLedger.mockResolvedValue(
      Array.from({ length: MAX_VIRTUAL_MEMBERS_PER_LEDGER }, (_, i) => ({
        id: `m-${i}`,
        userId: `uv-${i}`,
        role: "viewer",
        createdAt: new Date(),
        user: {
          id: `uv-${i}`,
          name: `V${i}`,
          email: null,
          avatar: null,
          flags: ["virtual"],
        },
      })),
    );
    await expectStatus(
      () => createVirtualMember("led-1", "user-e", "小明"),
      400,
    );
    expect(txUserCreate).not.toHaveBeenCalled();
  });

  it("counts only virtual members against the cap", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-e",
      ledgerId: "led-1",
      userId: "user-e",
      role: "editor",
    });
    mockMemberRepo.listByLedger.mockResolvedValue([
      ...Array.from({ length: MAX_VIRTUAL_MEMBERS_PER_LEDGER - 1 }, (_, i) => ({
        id: `m-${i}`,
        userId: `uv-${i}`,
        role: "viewer",
        createdAt: new Date(),
        user: {
          id: `uv-${i}`,
          name: `V${i}`,
          email: null,
          avatar: null,
          flags: ["virtual"],
        },
      })),
      {
        id: "m-real",
        userId: "u-real",
        role: "editor",
        createdAt: new Date(),
        user: { id: "u-real", name: "R", email: null, avatar: null, flags: [] },
      },
    ]);
    const result = await createVirtualMember("led-1", "user-e", "小明");
    expect(result.userId).toBe("user-v");
  });

  it("maps a foreign-key violation on the member insert to 404", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-e",
      ledgerId: "led-1",
      userId: "user-e",
      role: "editor",
    });
    mockMemberRepo.create.mockRejectedValue({ code: "P2003" });
    await expectStatus(
      () => createVirtualMember("led-1", "user-e", "小明"),
      404,
    );
  });
});

describe("removeMember", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockMemberRepo.delete.mockResolvedValue({});
    mockProjectMemberRepo.deleteAllInLedger.mockResolvedValue({});
    mockLookupRepo.findFlagsById.mockResolvedValue({ flags: [] });
  });

  it("deletes the membership", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-1",
      ledgerId: "led-1",
      userId: "user-b",
      role: "viewer",
    });
    const result = await removeMember("led-1", "user-b");
    expect(result).toEqual({ success: true });
    expect(mockMemberRepo.delete).toHaveBeenCalledWith(
      "led-1",
      "user-b",
      expect.anything(),
    );
  });

  it("returns 404 when the target is not a member", async () => {
    mockMemberRepo.findMembership.mockResolvedValue(null);
    await expectStatus(() => removeMember("led-1", "user-b"), 404);
    expect(mockMemberRepo.delete).not.toHaveBeenCalled();
  });

  it("re-verifies under the lock and refuses to remove a freshly promoted owner (race)", async () => {
    // The route's access check saw an editor, but a concurrent
    // transferOwnership promoted the target — the in-transaction re-check
    // must catch it or the ledger would be left ownerless.
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-1",
      ledgerId: "led-1",
      userId: "user-b",
      role: "owner",
    });
    await expectStatus(() => removeMember("led-1", "user-b"), 400);
    expect(mockMemberRepo.delete).not.toHaveBeenCalled();
  });

  it("deletes an unreferenced virtual member's user row too", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-1",
      ledgerId: "led-1",
      userId: "user-v",
      role: "viewer",
    });
    mockLookupRepo.findFlagsById.mockResolvedValue({
      flags: ["virtual"],
    });
    mockJournalRepo.countEntriesAnchoringUser.mockResolvedValue(0);
    mockJournalRepo.countParticipationsByUser.mockResolvedValue(0);
    mockMemberRepo.countMembershipsByUser.mockResolvedValue(0);
    await removeMember("led-1", "user-v");
    expect(mockLookupRepo.deleteById).toHaveBeenCalledWith(
      "user-v",
      expect.anything(),
    );
  });

  it("keeps the user row when the virtual member still belongs to another ledger", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-1",
      ledgerId: "led-1",
      userId: "user-v",
      role: "viewer",
    });
    mockLookupRepo.findFlagsById.mockResolvedValue({
      flags: ["virtual"],
    });
    mockJournalRepo.countEntriesAnchoringUser.mockResolvedValue(0);
    mockJournalRepo.countParticipationsByUser.mockResolvedValue(0);
    // The this-ledger row is already deleted inside the transaction, so any
    // surviving count means a membership elsewhere.
    mockMemberRepo.countMembershipsByUser.mockResolvedValue(1);
    await removeMember("led-1", "user-v");
    expect(mockLookupRepo.deleteById).not.toHaveBeenCalled();
  });

  it("keeps a referenced virtual member's user row for historical settlement", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-1",
      ledgerId: "led-1",
      userId: "user-v",
      role: "viewer",
    });
    mockLookupRepo.findFlagsById.mockResolvedValue({
      flags: ["virtual"],
    });
    mockJournalRepo.countEntriesAnchoringUser.mockResolvedValue(2);
    mockJournalRepo.countParticipationsByUser.mockResolvedValue(0);
    await removeMember("led-1", "user-v");
    expect(mockLookupRepo.deleteById).not.toHaveBeenCalled();
  });

  it("never deletes a real member's user row", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-1",
      ledgerId: "led-1",
      userId: "user-b",
      role: "viewer",
    });
    await removeMember("led-1", "user-b");
    expect(mockJournalRepo.countEntriesAnchoringUser).not.toHaveBeenCalled();
    expect(mockLookupRepo.deleteById).not.toHaveBeenCalled();
  });
});

describe("transferOwnership", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockMemberRepo.updateRole.mockResolvedValue({});
    mockLedgerRepo.setOwner.mockResolvedValue({});
    mockLookupRepo.findFlagsById.mockResolvedValue({ flags: [] });
  });

  it("demotes the acting owner to editor and promotes the target", async () => {
    mockMemberRepo.findMembership
      .mockResolvedValueOnce({
        id: "m-owner",
        ledgerId: "led-1",
        userId: "user-owner",
        role: "owner",
      })
      .mockResolvedValueOnce({
        id: "m-target",
        ledgerId: "led-1",
        userId: "user-b",
        role: "editor",
      });
    const result = await transferOwnership("led-1", "user-owner", "user-b");
    expect(result).toEqual({ success: true });
    expect(mockMemberRepo.updateRole).toHaveBeenCalledWith(
      "led-1",
      "user-owner",
      "editor",
      expect.anything(),
    );
    expect(mockMemberRepo.updateRole).toHaveBeenCalledWith(
      "led-1",
      "user-b",
      "owner",
      expect.anything(),
    );
    expect(mockLedgerRepo.setOwner).toHaveBeenCalledWith(
      "led-1",
      "user-b",
      expect.anything(),
    );
    // The default flag is owner-scoped; transferring must clear it so the
    // new owner doesn't end up with two defaults.
    expect(mockLedgerRepo.setDefault).toHaveBeenCalledWith(
      "led-1",
      false,
      expect.anything(),
    );
  });

  it("returns 400 when transferring to yourself", async () => {
    await expectStatus(
      () => transferOwnership("led-1", "user-owner", "user-owner"),
      400,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
  });

  it("re-verifies ownership under the lock and returns 403 for a stale owner (race)", async () => {
    // The route's access check passed, but a concurrent transfer already
    // demoted the acting user — the in-transaction check must catch it.
    mockMemberRepo.findMembership.mockResolvedValueOnce({
      id: "m-owner",
      ledgerId: "led-1",
      userId: "user-owner",
      role: "editor",
    });
    await expectStatus(
      () => transferOwnership("led-1", "user-owner", "user-b"),
      403,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
    expect(mockLedgerRepo.setOwner).not.toHaveBeenCalled();
  });

  it("returns 404 when the target is not a member", async () => {
    mockMemberRepo.findMembership
      .mockResolvedValueOnce({
        id: "m-owner",
        ledgerId: "led-1",
        userId: "user-owner",
        role: "owner",
      })
      .mockResolvedValueOnce(null);
    await expectStatus(
      () => transferOwnership("led-1", "user-owner", "user-b"),
      404,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
  });

  it("refuses to transfer the ledger to a virtual member (400)", async () => {
    mockMemberRepo.findMembership
      .mockResolvedValueOnce({
        id: "m-owner",
        ledgerId: "led-1",
        userId: "user-owner",
        role: "owner",
      })
      .mockResolvedValueOnce({
        id: "m-target",
        ledgerId: "led-1",
        userId: "user-v",
        role: "viewer",
      });
    mockLookupRepo.findFlagsById.mockResolvedValue({
      flags: ["virtual"],
    });
    await expectStatus(
      () => transferOwnership("led-1", "user-owner", "user-v"),
      400,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
    expect(mockLedgerRepo.setOwner).not.toHaveBeenCalled();
  });
});

describe("listMembers", () => {
  it("sorts by role rank (owner → editor → viewer), then createdAt asc", async () => {
    const t0 = new Date("2024-01-01T00:00:00Z");
    const t1 = new Date("2024-01-02T00:00:00Z");
    const t2 = new Date("2024-01-03T00:00:00Z");
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "m-1", userId: "u-viewer-1", role: "viewer", createdAt: t2 },
      { id: "m-2", userId: "u-editor-1", role: "editor", createdAt: t1 },
      { id: "m-3", userId: "u-viewer-2", role: "viewer", createdAt: t0 },
      { id: "m-4", userId: "u-owner", role: "owner", createdAt: t0 },
      { id: "m-5", userId: "u-editor-2", role: "editor", createdAt: t0 },
    ]);
    const { members } = await listMembers("led-1", {
      userId: "u-owner",
      role: "owner",
    });
    expect(members.map((m) => m.userId)).toEqual([
      "u-owner",
      "u-editor-2",
      "u-editor-1",
      "u-viewer-2",
      "u-viewer-1",
    ]);
  });

  it("redacts co-member emails for non-owners", async () => {
    mockMemberRepo.listByLedger.mockResolvedValue([
      {
        id: "m-1",
        userId: "u-viewer-1",
        role: "viewer",
        createdAt: new Date(),
        user: { id: "u-viewer-1", name: "V", email: "v@x.com", avatar: null },
      },
      {
        id: "m-2",
        userId: "u-editor-1",
        role: "editor",
        createdAt: new Date(),
        user: { id: "u-editor-1", name: "E", email: "e@x.com", avatar: null },
      },
    ]);
    const { members } = await listMembers("led-1", {
      userId: "u-viewer-1",
      role: "viewer",
    });
    expect(members[0].user?.email).toBeNull();
    expect(members[1].user?.email).toBeNull();
  });

  it("scopes a guest's roster to members sharing one of their projects", async () => {
    const t0 = new Date("2024-01-01T00:00:00Z");
    mockMemberRepo.listByLedger.mockResolvedValue([
      { id: "m-1", userId: "u-owner", role: "owner", createdAt: t0 },
      { id: "m-2", userId: "u-viewer", role: "viewer", createdAt: t0 },
      { id: "m-3", userId: "u-guest", role: "guest", createdAt: t0 },
    ]);
    // Only the owner shares a project with the guest.
    mockProjectMemberRepo.listSharedMemberUserIds.mockResolvedValue([
      { userId: "u-guest" },
      { userId: "u-owner" },
    ]);
    const { members } = await listMembers("led-1", {
      userId: "u-guest",
      role: "guest",
    });
    expect(mockProjectMemberRepo.listSharedMemberUserIds).toHaveBeenCalledWith(
      "led-1",
      "u-guest",
    );
    expect(members.map((m) => m.userId)).toEqual(["u-owner", "u-guest"]);
  });

  it("derives isVirtual from user flags and never serializes the raw flags", async () => {
    mockMemberRepo.listByLedger.mockResolvedValue([
      {
        id: "m-1",
        userId: "u-virtual",
        role: "viewer",
        createdAt: new Date(),
        user: {
          id: "u-virtual",
          name: "小明",
          email: null,
          avatar: null,
          flags: ["virtual"],
        },
      },
      {
        id: "m-2",
        userId: "u-real",
        role: "editor",
        createdAt: new Date(),
        user: {
          id: "u-real",
          name: "R",
          email: "r@x.com",
          avatar: null,
          flags: [],
        },
      },
    ]);
    const { members } = await listMembers("led-1", {
      userId: "u-owner",
      role: "owner",
    });
    const virtual = members.find((m) => m.userId === "u-virtual");
    const real = members.find((m) => m.userId === "u-real");
    expect(virtual?.user).toEqual({
      id: "u-virtual",
      name: "小明",
      email: null,
      avatar: null,
      isVirtual: true,
    });
    expect(real?.user).toEqual({
      id: "u-real",
      name: "R",
      email: "r@x.com",
      avatar: null,
    });
    expect("flags" in (virtual?.user ?? {})).toBe(false);
    expect("flags" in (real?.user ?? {})).toBe(false);
  });
});
