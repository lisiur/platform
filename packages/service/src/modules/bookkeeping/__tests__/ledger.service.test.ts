import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        ledger: { update: vi.fn() },
      }),
    ),
  },
}));

vi.mock("../ledger.repository", () => ({
  ledgerRepository: {
    findById: vi.fn(),
    findDefaultForOwner: vi.fn(),
    findFirstActiveOwned: vi.fn(),
    listForUser: vi.fn(),
    listOwnedIds: vi.fn(),
    clearDefaultForOwner: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setOwner: vi.fn(),
    setDefault: vi.fn(),
    delete: vi.fn(),
  },
  lockLedgerRow: vi.fn(),
  lockOwnerLedgers: vi.fn(),
  lockOwnerProvisioning: vi.fn(),
}));

vi.mock("../ledger-member.repository", () => ({
  ledgerMemberRepository: {
    create: vi.fn(),
    updateRole: vi.fn(),
    findFirstOtherMember: vi.fn(),
  },
}));

vi.mock("../account.repository", () => ({
  accountRepository: {
    createStarterAccounts: vi.fn(),
  },
}));

vi.mock("../journal.repository", () => ({
  journalRepository: {
    deleteByLedger: vi.fn(),
  },
}));

import { prisma } from "#lib/db";
import { accountRepository } from "../account.repository";
import { journalRepository } from "../journal.repository";
import { ledgerRepository } from "../ledger.repository";
import {
  deleteLedger,
  ensureDefaultLedger,
  listLedgers,
  releaseOwnedLedgers,
  setDefaultLedger,
  updateLedger,
} from "../ledger.service";
import { ledgerMemberRepository } from "../ledger-member.repository";

const mockLedgerRepo = ledgerRepository as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;
const mockMemberRepo = ledgerMemberRepository as unknown as {
  create: ReturnType<typeof vi.fn>;
  updateRole: ReturnType<typeof vi.fn>;
  findFirstOtherMember: ReturnType<typeof vi.fn>;
};
const mockAccountRepo = accountRepository as unknown as {
  createStarterAccounts: ReturnType<typeof vi.fn>;
};
const mockJournalRepo = journalRepository as unknown as {
  deleteByLedger: ReturnType<typeof vi.fn>;
};
const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
};

async function expectStatus(
  fn: () => Promise<unknown>,
  status: number,
): Promise<void> {
  const err = await fn().catch((e) => e);
  expect(err).toBeInstanceOf(HTTPException);
  expect((err as HTTPException).status).toBe(status);
}

describe("ensureDefaultLedger", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ ledger: { update: vi.fn() } }),
    );
  });

  it("returns the existing default without creating anything", async () => {
    const existing = { id: "led-1", isDefault: true };
    mockLedgerRepo.findDefaultForOwner.mockResolvedValue(existing);
    const result = await ensureDefaultLedger("user-a");
    expect(result).toBe(existing);
    expect(mockLedgerRepo.create).not.toHaveBeenCalled();
    expect(mockAccountRepo.createStarterAccounts).not.toHaveBeenCalled();
  });

  it("does not re-seed a deliberately emptied chart of accounts", async () => {
    const existing = { id: "led-1", isDefault: true };
    mockLedgerRepo.findDefaultForOwner.mockResolvedValue(existing);
    const result = await ensureDefaultLedger("user-a");
    expect(result).toBe(existing);
    expect(mockAccountRepo.createStarterAccounts).not.toHaveBeenCalled();
  });

  it("returns the default a concurrent caller created (no double create)", async () => {
    const existing = { id: "led-1", isDefault: true };
    // Pre-check outside the tx sees none; re-check under the lock sees one.
    mockLedgerRepo.findDefaultForOwner
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const result = await ensureDefaultLedger("user-a");
    expect(result).toBe(existing);
    expect(mockLedgerRepo.create).not.toHaveBeenCalled();
    expect(mockAccountRepo.createStarterAccounts).not.toHaveBeenCalled();
  });

  it("creates a default ledger with owner membership and a coded starter chart", async () => {
    mockLedgerRepo.findDefaultForOwner
      .mockResolvedValueOnce(null) // pre-check outside tx
      .mockResolvedValueOnce(null); // re-check inside tx
    mockLedgerRepo.findFirstActiveOwned.mockResolvedValue(null);
    mockLedgerRepo.create.mockResolvedValue({ id: "led-new" });
    await ensureDefaultLedger("user-a");
    expect(mockLedgerRepo.clearDefaultForOwner).toHaveBeenCalledWith(
      "user-a",
      expect.anything(),
    );
    expect(mockLedgerRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "user-a", isDefault: true }),
      expect.anything(),
    );
    expect(mockMemberRepo.create).toHaveBeenCalledWith(
      { ledgerId: "led-new", userId: "user-a", role: "owner" },
      expect.anything(),
    );
    const [, accounts] = mockAccountRepo.createStarterAccounts.mock
      .calls[0] as [
      string,
      Array<{ code?: string; flags?: string[] }>,
      unknown,
    ];
    expect(accounts.some((a) => a.code === "openingBalance")).toBe(true);
    const defaultAccount = accounts.find((a) => a.code === "defaultAccount");
    expect(defaultAccount?.flags).toContain("defaultDebit");
    expect(defaultAccount?.flags).toContain("defaultCredit");
  });

  it("promotes the earliest active owned ledger instead of provisioning a new one", async () => {
    // The default was archived or transferred away, but active owned
    // ledgers remain: the earliest is promoted, nothing new is created.
    mockLedgerRepo.findDefaultForOwner
      .mockResolvedValueOnce(null) // pre-check outside tx
      .mockResolvedValueOnce(null); // re-check inside tx
    const candidate = { id: "led-earliest", ownerId: "user-a" };
    mockLedgerRepo.findFirstActiveOwned.mockResolvedValue(candidate);
    const result = await ensureDefaultLedger("user-a");
    expect(result).toBe(candidate);
    expect(mockLedgerRepo.setDefault).toHaveBeenCalledWith(
      "led-earliest",
      true,
      expect.anything(),
    );
    expect(mockLedgerRepo.create).not.toHaveBeenCalled();
    expect(mockMemberRepo.create).not.toHaveBeenCalled();
    expect(mockAccountRepo.createStarterAccounts).not.toHaveBeenCalled();
  });
});

describe("updateLedger", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      ownerId: "user-a",
      status: "active",
    });
  });

  it("allows updating writable fields on an active ledger", async () => {
    mockLedgerRepo.update.mockResolvedValue({ id: "led-1", name: "New" });
    await updateLedger("user-a", "led-1", { name: "New" });
    expect(mockLedgerRepo.update).toHaveBeenCalledWith(
      "led-1",
      { name: "New" },
      expect.anything(),
    );
  });

  it("returns 404 when the ledger no longer exists", async () => {
    mockLedgerRepo.findById.mockResolvedValue(null);
    await expectStatus(
      () => updateLedger("user-a", "led-1", { name: "New" }),
      404,
    );
    expect(mockLedgerRepo.update).not.toHaveBeenCalled();
  });

  it("re-verifies ownership under the lock and returns 403 for a stale owner (race)", async () => {
    // The route's access check passed, but a concurrent transferOwnership
    // reassigned the ledger before the row lock was taken.
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      ownerId: "user-other",
      status: "active",
    });
    await expectStatus(
      () => updateLedger("user-a", "led-1", { name: "X" }),
      403,
    );
    expect(mockLedgerRepo.update).not.toHaveBeenCalled();
  });

  it("rejects invalid status values (400)", async () => {
    await expectStatus(
      () => updateLedger("user-a", "led-1", { status: "bogus" as string }),
      400,
    );
    expect(mockLedgerRepo.update).not.toHaveBeenCalled();
  });

  it("rejects writes against archived ledgers (400)", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      ownerId: "user-a",
      status: "archived",
    });
    await expectStatus(
      () => updateLedger("user-a", "led-1", { name: "X" }),
      400,
    );
    expect(mockLedgerRepo.update).not.toHaveBeenCalled();
  });

  it("allows un-archiving (status: active) on an archived ledger", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      ownerId: "user-a",
      status: "archived",
    });
    mockLedgerRepo.update.mockResolvedValue({ id: "led-1", status: "active" });
    await updateLedger("user-a", "led-1", { status: "active" });
    expect(mockLedgerRepo.update).toHaveBeenCalledWith(
      "led-1",
      { status: "active" },
      expect.anything(),
    );
  });

  it("drops the default flag when archiving the default ledger", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      ownerId: "user-a",
      status: "active",
      isDefault: true,
    });
    mockLedgerRepo.update.mockResolvedValue({
      id: "led-1",
      status: "archived",
    });
    await updateLedger("user-a", "led-1", { status: "archived" });
    // Otherwise ensureDefaultLedger keeps handing out a read-only ledger.
    expect(mockLedgerRepo.setDefault).toHaveBeenCalledWith(
      "led-1",
      false,
      expect.anything(),
    );
  });

  it("keeps the default flag untouched when archiving a non-default ledger", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      ownerId: "user-a",
      status: "active",
      isDefault: false,
    });
    mockLedgerRepo.update.mockResolvedValue({
      id: "led-1",
      status: "archived",
    });
    await updateLedger("user-a", "led-1", { status: "archived" });
    expect(mockLedgerRepo.setDefault).not.toHaveBeenCalled();
  });

  it("rejects archiving while simultaneously renaming (400)", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      ownerId: "user-a",
      status: "archived",
    });
    await expectStatus(
      () => updateLedger("user-a", "led-1", { name: "X", status: "archived" }),
      400,
    );
    expect(mockLedgerRepo.update).not.toHaveBeenCalled();
  });
});

describe("deleteLedger", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      ownerId: "user-a",
      status: "active",
    });
    mockLedgerRepo.delete.mockResolvedValue({});
    mockJournalRepo.deleteByLedger.mockResolvedValue({});
  });

  it("deletes entries before the ledger", async () => {
    await deleteLedger("user-a", "led-1");
    // The Ledger→BookAccount cascade converges with the JournalLine→BookAccount
    // Restrict: entries must go first or the FK fires.
    expect(mockJournalRepo.deleteByLedger).toHaveBeenCalledWith(
      "led-1",
      expect.anything(),
    );
    expect(mockLedgerRepo.delete).toHaveBeenCalledWith(
      "led-1",
      expect.anything(),
    );
  });

  it("returns 404 when the ledger no longer exists", async () => {
    mockLedgerRepo.findById.mockResolvedValue(null);
    await expectStatus(() => deleteLedger("user-a", "led-1"), 404);
    expect(mockLedgerRepo.delete).not.toHaveBeenCalled();
  });

  it("re-verifies ownership under the lock and returns 403 for a stale owner (race)", async () => {
    // A concurrent transferOwnership reassigned the ledger after the route's
    // access check; the former owner must not be able to delete it.
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      ownerId: "user-other",
      status: "active",
    });
    await expectStatus(() => deleteLedger("user-a", "led-1"), 403);
    expect(mockJournalRepo.deleteByLedger).not.toHaveBeenCalled();
    expect(mockLedgerRepo.delete).not.toHaveBeenCalled();
  });
});

describe("setDefaultLedger", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ ledger: { update: vi.fn() } }),
    );
  });

  it("clears other defaults then marks the target (owner only)", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      ownerId: "user-a",
      status: "active",
    });
    await setDefaultLedger("user-a", "led-1");
    expect(mockLedgerRepo.clearDefaultForOwner).toHaveBeenCalledWith(
      "user-a",
      expect.anything(),
    );
    expect(mockLedgerRepo.setDefault).toHaveBeenCalledWith(
      "led-1",
      true,
      expect.anything(),
    );
  });

  it("returns 403 for non-owners", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      ownerId: "user-a",
      status: "active",
    });
    await expectStatus(() => setDefaultLedger("user-b", "led-1"), 403);
    expect(mockLedgerRepo.setDefault).not.toHaveBeenCalled();
  });

  it("rejects archived ledgers (400)", async () => {
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      ownerId: "user-a",
      status: "archived",
    });
    await expectStatus(() => setDefaultLedger("user-a", "led-1"), 400);
    expect(mockLedgerRepo.clearDefaultForOwner).not.toHaveBeenCalled();
    expect(mockLedgerRepo.setDefault).not.toHaveBeenCalled();
  });
});

describe("releaseOwnedLedgers", () => {
  const tx = {} as Parameters<typeof releaseOwnedLedgers>[1];

  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockImplementation(
      async (id: string) => ({ id, ownerId: "user-a" }) as never,
    );
  });

  it("promotes the earliest remaining member on shared ledgers", async () => {
    mockLedgerRepo.listOwnedIds.mockResolvedValue([{ id: "led-1" }]);
    mockMemberRepo.findFirstOtherMember.mockResolvedValue({
      userId: "user-heir",
    });
    await releaseOwnedLedgers("user-a", tx);
    expect(mockMemberRepo.updateRole).toHaveBeenCalledWith(
      "led-1",
      "user-heir",
      "owner",
      tx,
    );
    expect(mockLedgerRepo.setOwner).toHaveBeenCalledWith(
      "led-1",
      "user-heir",
      tx,
    );
    // The departed owner's default flag must not survive the handover; two
    // defaults resolved by earliest createdAt would shadow the heir's own.
    expect(mockLedgerRepo.setDefault).toHaveBeenCalledWith("led-1", false, tx);
    expect(mockLedgerRepo.delete).not.toHaveBeenCalled();
  });

  it("deletes ledgers with no other members", async () => {
    mockLedgerRepo.listOwnedIds.mockResolvedValue([{ id: "led-1" }]);
    mockMemberRepo.findFirstOtherMember.mockResolvedValue(null);
    await releaseOwnedLedgers("user-a", tx);
    expect(mockMemberRepo.updateRole).not.toHaveBeenCalled();
    // Entries go first: the Ledger→BookAccount cascade converges with the
    // JournalLine→BookAccount Restrict and deleting the ledger outright
    // trips the FK.
    expect(mockJournalRepo.deleteByLedger).toHaveBeenCalledWith("led-1", tx);
    expect(mockLedgerRepo.delete).toHaveBeenCalledWith("led-1", tx);
  });

  it("handles a mix of shared and solo ledgers", async () => {
    mockLedgerRepo.listOwnedIds.mockResolvedValue([
      { id: "led-shared" },
      { id: "led-solo" },
    ]);
    mockMemberRepo.findFirstOtherMember
      .mockResolvedValueOnce({ userId: "user-heir" })
      .mockResolvedValueOnce(null);
    await releaseOwnedLedgers("user-a", tx);
    expect(mockLedgerRepo.setOwner).toHaveBeenCalledWith(
      "led-shared",
      "user-heir",
      tx,
    );
    expect(mockJournalRepo.deleteByLedger).toHaveBeenCalledWith("led-solo", tx);
    expect(mockLedgerRepo.delete).toHaveBeenCalledWith("led-solo", tx);
  });

  it("is a no-op when the user owns nothing", async () => {
    mockLedgerRepo.listOwnedIds.mockResolvedValue([]);
    await releaseOwnedLedgers("user-a", tx);
    expect(mockLedgerRepo.delete).not.toHaveBeenCalled();
    expect(mockLedgerRepo.setOwner).not.toHaveBeenCalled();
  });

  it("skips ledgers transferred away before the row lock was taken", async () => {
    mockLedgerRepo.listOwnedIds.mockResolvedValue([{ id: "led-1" }]);
    // A concurrent transferOwnership reassigned the ledger mid-flight.
    mockLedgerRepo.findById.mockResolvedValue({
      id: "led-1",
      ownerId: "user-other",
    });
    await releaseOwnedLedgers("user-a", tx);
    expect(mockMemberRepo.findFirstOtherMember).not.toHaveBeenCalled();
    expect(mockLedgerRepo.setOwner).not.toHaveBeenCalled();
    expect(mockLedgerRepo.delete).not.toHaveBeenCalled();
  });
});

describe("listLedgers", () => {
  it("exposes myRole and shared flag", async () => {
    mockLedgerRepo.listForUser.mockResolvedValue([
      {
        id: "led-1",
        ownerId: "user-a",
        name: "Default",
        description: null,
        currency: "CNY",
        status: "active",
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [{ role: "owner" }],
        _count: { members: 1 },
      },
      {
        id: "led-2",
        ownerId: "user-x",
        name: "Family",
        description: null,
        currency: "CNY",
        status: "active",
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [{ role: "viewer" }],
        _count: { members: 3 },
      },
    ]);
    const { ledgers } = await listLedgers("user-a");
    expect(ledgers[0]).toMatchObject({ myRole: "owner", shared: false });
    expect(ledgers[1]).toMatchObject({ myRole: "viewer", shared: true });
  });

  it("does not leak the owner's isDefault flag on shared ledgers", async () => {
    mockLedgerRepo.listForUser.mockResolvedValue([
      {
        id: "led-1",
        ownerId: "user-a",
        name: "Default",
        description: null,
        currency: "CNY",
        status: "active",
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [{ role: "owner" }],
        _count: { members: 1 },
      },
      {
        id: "led-2",
        ownerId: "user-x",
        name: "Family",
        description: null,
        currency: "CNY",
        status: "active",
        // The owner of led-2 flagged it default; member user-a must not see
        // that flag or their client would auto-select the shared ledger.
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [{ role: "viewer" }],
        _count: { members: 3 },
      },
    ]);
    const { ledgers } = await listLedgers("user-a");
    expect(ledgers[0].isDefault).toBe(true);
    expect(ledgers[1].isDefault).toBe(false);
  });

  it("sorts the viewer's own default first, ignoring the shared ledger's owner-side flag", async () => {
    // Repository order is createdAt asc: the shared ledger (older, flagged
    // default by ITS owner) comes first. The member's own default must still
    // sort first — the owner's flag must not steer the member's ordering.
    mockLedgerRepo.listForUser.mockResolvedValue([
      {
        id: "led-shared",
        ownerId: "user-x",
        name: "Family",
        description: null,
        currency: "CNY",
        status: "active",
        isDefault: true,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
        members: [{ role: "viewer" }],
        _count: { members: 3 },
      },
      {
        id: "led-own",
        ownerId: "user-a",
        name: "Mine",
        description: null,
        currency: "CNY",
        status: "active",
        isDefault: true,
        createdAt: new Date("2026-02-01"),
        updatedAt: new Date("2026-02-01"),
        members: [{ role: "owner" }],
        _count: { members: 1 },
      },
    ]);
    const { ledgers } = await listLedgers("user-a");
    expect(ledgers.map((l: { id: string }) => l.id)).toEqual([
      "led-own",
      "led-shared",
    ]);
  });
});
