import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: vi.fn(),
        ledgerMember: {},
        ledgerShareCode: {},
        ledger: {},
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
  },
}));

vi.mock("../share-code.repository", () => ({
  shareCodeRepository: {
    findByCode: vi.fn(),
    create: vi.fn(),
    incrementUses: vi.fn(),
  },
}));

import { ledgerRepository } from "../ledger.repository";
import { ledgerMemberRepository } from "../ledger-member.repository";
import {
  createShareCode,
  listMembers,
  redeemShareCode,
  removeMember,
  transferOwnership,
  updateMemberRole,
} from "../share.service";
import { shareCodeRepository } from "../share-code.repository";

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
};
const mockShareRepo = shareCodeRepository as unknown as {
  findByCode: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  incrementUses: ReturnType<typeof vi.fn>;
};

const baseCode = {
  id: "sc-1",
  ledgerId: "led-1",
  code: "A2B4C6D8E9F2",
  role: "editor",
  status: "active",
  expiresAt: null,
  maxUses: null,
  usesCount: 0,
  createdById: "user-owner",
  createdAt: new Date(),
};

const baseLedger = {
  id: "led-1",
  ownerId: "user-owner",
  name: "Family",
  status: "active",
};

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
    mockShareRepo.findByCode.mockResolvedValue(baseCode);
    mockLedgerRepo.findById.mockResolvedValue(baseLedger);
    mockMemberRepo.findMembership.mockResolvedValue(null);
    mockMemberRepo.create.mockResolvedValue({});
    mockShareRepo.incrementUses.mockResolvedValue({});
  });

  it("adds the redeemer as a member and increments uses", async () => {
    const result = await redeemShareCode("user-b", "A2B4C6D8E9F2");
    expect(result).toEqual({ ledgerId: "led-1", role: "editor" });
    expect(mockMemberRepo.create).toHaveBeenCalledWith(
      { ledgerId: "led-1", userId: "user-b", role: "editor" },
      expect.anything(),
    );
    expect(mockShareRepo.incrementUses).toHaveBeenCalledWith(
      "sc-1",
      expect.anything(),
    );
  });

  it("returns 404 for an unknown code", async () => {
    mockShareRepo.findByCode.mockResolvedValue(null);
    await expectStatus(() => redeemShareCode("user-b", "NOPE"), 404);
  });

  it("rejects revoked codes (400)", async () => {
    mockShareRepo.findByCode.mockResolvedValue({
      ...baseCode,
      status: "revoked",
    });
    await expectStatus(() => redeemShareCode("user-b", "A2B4C6D8E9F2"), 400);
  });

  it("rejects expired codes (400)", async () => {
    mockShareRepo.findByCode.mockResolvedValue({
      ...baseCode,
      expiresAt: new Date("2020-01-01"),
    });
    await expectStatus(() => redeemShareCode("user-b", "A2B4C6D8E9F2"), 400);
  });

  it("rejects codes past their usage cap (400)", async () => {
    mockShareRepo.findByCode.mockResolvedValue({
      ...baseCode,
      maxUses: 2,
      usesCount: 2,
    });
    await expectStatus(() => redeemShareCode("user-b", "A2B4C6D8E9F2"), 400);
  });

  it("rejects redemption of an archived ledger (400)", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      ...baseLedger,
      status: "archived",
    });
    await expectStatus(() => redeemShareCode("user-b", "A2B4C6D8E9F2"), 400);
  });

  it("rejects users who are already members (400)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-1",
      ledgerId: "led-1",
      userId: "user-b",
      role: "viewer",
    });
    await expectStatus(() => redeemShareCode("user-b", "A2B4C6D8E9F2"), 400);
    expect(mockMemberRepo.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the ledger is deleted mid-redeem (race)", async () => {
    // The unlocked peek found the code, but a concurrent deleteLedger won
    // the ledger row lock and committed: the locked re-read finds nothing.
    mockLedgerRepo.findById.mockResolvedValue(null);
    await expectStatus(() => redeemShareCode("user-b", "A2B4C6D8E9F2"), 404);
    expect(mockMemberRepo.create).not.toHaveBeenCalled();
    expect(mockShareRepo.incrementUses).not.toHaveBeenCalled();
  });

  it("maps a foreign-key violation on the member insert to 404", async () => {
    // Defense-in-depth for paths the ledger row lock can't cover.
    mockMemberRepo.create.mockRejectedValue({ code: "P2003" });
    await expectStatus(() => redeemShareCode("user-b", "A2B4C6D8E9F2"), 404);
    expect(mockShareRepo.incrementUses).not.toHaveBeenCalled();
  });
});

describe("createShareCode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue(baseLedger);
    // The generated code collides with nothing.
    mockShareRepo.findByCode.mockResolvedValue(null);
    mockShareRepo.create.mockResolvedValue({});
  });

  it("creates a code bound to the ledger and creator", async () => {
    await createShareCode("led-1", "user-owner", { role: "viewer" });
    expect(mockShareRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ledgerId: "led-1",
        role: "viewer",
        createdById: "user-owner",
      }),
      expect.anything(),
    );
  });

  it("rejects an expiry date in the past (400)", async () => {
    await expectStatus(
      () =>
        createShareCode("led-1", "user-owner", {
          role: "editor",
          expiresAt: new Date("2020-01-01"),
        }),
      400,
    );
    expect(mockShareRepo.create).not.toHaveBeenCalled();
  });

  it("rejects maxUses below 1 (400)", async () => {
    await expectStatus(
      () =>
        createShareCode("led-1", "user-owner", {
          role: "editor",
          maxUses: 0,
        }),
      400,
    );
    expect(mockShareRepo.create).not.toHaveBeenCalled();
  });

  it("rejects a code for a ledger archived after the route's check (race, 400)", async () => {
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
    expect(mockShareRepo.create).not.toHaveBeenCalled();
  });

  it("rejects a code for a ledger transferred away after the route's check (race, 403)", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      ...baseLedger,
      ownerId: "user-other",
    });
    await expectStatus(
      () => createShareCode("led-1", "user-owner", { role: "viewer" }),
      403,
    );
    expect(mockShareRepo.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the ledger is deleted mid-create (race)", async () => {
    mockLedgerRepo.findById.mockResolvedValue(null);
    await expectStatus(
      () => createShareCode("led-1", "user-owner", { role: "viewer" }),
      404,
    );
    expect(mockShareRepo.create).not.toHaveBeenCalled();
  });
});

describe("updateMemberRole", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-1",
      ledgerId: "led-1",
      userId: "user-b",
      role: "editor",
    });
    mockMemberRepo.updateRole.mockResolvedValue({});
  });

  it("updates the member's role", async () => {
    const result = await updateMemberRole(
      "led-1",
      "user-owner",
      "user-b",
      "viewer",
    );
    expect(result).toEqual({ success: true });
    expect(mockMemberRepo.updateRole).toHaveBeenCalledWith(
      "led-1",
      "user-b",
      "viewer",
      expect.anything(),
    );
  });

  it("returns 400 when the role is invalid", async () => {
    await expectStatus(
      () => updateMemberRole("led-1", "user-owner", "user-b", "owner"),
      400,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
  });

  it("returns 400 when changing your own role", async () => {
    await expectStatus(
      () => updateMemberRole("led-1", "user-owner", "user-owner", "viewer"),
      400,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
  });

  it("returns 404 when the target is not a member", async () => {
    mockMemberRepo.findMembership.mockResolvedValue(null);
    await expectStatus(
      () => updateMemberRole("led-1", "user-owner", "user-b", "viewer"),
      404,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
  });

  it("returns 400 when the target is the owner", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({
      id: "m-owner",
      ledgerId: "led-1",
      userId: "user-b",
      role: "owner",
    });
    await expectStatus(
      () => updateMemberRole("led-1", "user-owner", "user-b", "viewer"),
      400,
    );
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
  });
});

describe("removeMember", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockMemberRepo.delete.mockResolvedValue({});
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
});

describe("transferOwnership", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockMemberRepo.updateRole.mockResolvedValue({});
    mockLedgerRepo.setOwner.mockResolvedValue({});
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
    const { members } = await listMembers("led-1", "owner");
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
    const { members } = await listMembers("led-1", "viewer");
    expect(members[0].user?.email).toBeNull();
    expect(members[1].user?.email).toBeNull();
  });
});
