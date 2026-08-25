import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  },
}));

vi.mock("../real-account.repository", () => ({
  realAccountRepository: {
    listWithPockets: vi.fn(),
    sumLinesByOwnerPockets: vi.fn(),
    findById: vi.fn(),
    lockById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countPockets: vi.fn(),
  },
}));

import { realAccountRepository } from "../real-account.repository";
import {
  createRealAccount,
  deleteRealAccount,
  listRealAccounts,
  updateRealAccount,
} from "../real-account.service";

const mockRepo = realAccountRepository as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

const LEDGER_FAMILY = { id: "led-1", name: "Family", status: "active" };
const LEDGER_PRIVATE = { id: "led-2", name: "Private", status: "active" };

function pocket(
  id: string,
  ledger: { id: string; name: string; status: string },
  type: "asset" | "liability",
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    ledgerId: ledger.id,
    type,
    name: null,
    code: null,
    status: "active",
    icon: null,
    sortOrder: 0,
    ledger,
    ...overrides,
  };
}

function realAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "ra-1",
    ownerId: "user-a",
    name: "CMB Card",
    type: "asset",
    status: "active",
    icon: null,
    meta: null,
    pockets: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function sum(accountId: string, debit: number, credit: number) {
  return { accountId, _sum: { debit, credit } };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("listRealAccounts", () => {
  it("aggregates pocket balances into per-master and grand totals", async () => {
    mockRepo.listWithPockets.mockResolvedValue([
      realAccount({
        pockets: [
          pocket("p-1", LEDGER_FAMILY, "asset"),
          pocket("p-2", LEDGER_PRIVATE, "asset"),
        ],
      }),
      realAccount({
        id: "ra-2",
        type: "liability",
        pockets: [pocket("p-3", LEDGER_FAMILY, "liability")],
      }),
    ]);
    mockRepo.sumLinesByOwnerPockets.mockResolvedValue([
      sum("p-1", 8000, 0),
      sum("p-2", 60000, 2300),
      sum("p-3", 0, 1200),
    ]);

    const { realAccounts, totals } = await listRealAccounts("user-a");

    expect(realAccounts[0].balance).toBe(65700); // 8000 + 57700
    expect(realAccounts[0].pockets[0].balance).toBe(8000);
    expect(realAccounts[0].pockets[1].balance).toBe(57700);
    expect(realAccounts[1].balance).toBe(1200); // liability: credit − debit
    expect(totals).toEqual({
      assets: 65700,
      liabilities: 1200,
      netWorth: 64500,
    });
  });

  it("excludes archived masters from totals but keeps them listed", async () => {
    mockRepo.listWithPockets.mockResolvedValue([
      realAccount({
        status: "archived",
        pockets: [pocket("p-1", LEDGER_FAMILY, "asset")],
      }),
    ]);
    mockRepo.sumLinesByOwnerPockets.mockResolvedValue([sum("p-1", 500, 0)]);

    const { realAccounts, totals } = await listRealAccounts("user-a");

    expect(realAccounts[0].balance).toBe(500);
    expect(totals).toEqual({ assets: 0, liabilities: 0, netWorth: 0 });
  });
});

describe("createRealAccount", () => {
  it("rejects types outside asset/liability", async () => {
    const err = await createRealAccount("user-a", {
      name: "Salary",
      type: "income",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { status: number }).status).toBe(400);
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it("creates an asset master", async () => {
    mockRepo.create.mockResolvedValue(realAccount());
    await createRealAccount("user-a", { name: "CMB Card", type: "asset" });
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "user-a", type: "asset" }),
    );
  });
});

describe("updateRealAccount", () => {
  it("404s on a foreign real account (no existence leak)", async () => {
    mockRepo.findById.mockResolvedValue(
      realAccount({ id: "ra-x", ownerId: "someone-else" }),
    );
    const err = await updateRealAccount("user-a", "ra-x", {
      name: "Nope",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { status: number }).status).toBe(404);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});

describe("deleteRealAccount", () => {
  it("404s on a missing or foreign real account (no existence leak)", async () => {
    mockRepo.lockById.mockResolvedValue(null);
    const err = await deleteRealAccount("user-a", "ra-x").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { status: number }).status).toBe(404);
    expect(mockRepo.delete).not.toHaveBeenCalled();
  });

  it("refuses deletion while pockets are still linked", async () => {
    mockRepo.lockById.mockResolvedValue(realAccount());
    mockRepo.countPockets.mockResolvedValue(2);
    const err = await deleteRealAccount("user-a", "ra-1").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { status: number }).status).toBe(409);
    expect(mockRepo.delete).not.toHaveBeenCalled();
  });

  it("deletes once every pocket is unlinked (inside the guard transaction)", async () => {
    mockRepo.lockById.mockResolvedValue(realAccount());
    mockRepo.countPockets.mockResolvedValue(0);
    await deleteRealAccount("user-a", "ra-1");
    expect(mockRepo.lockById).toHaveBeenCalledWith("ra-1", expect.anything());
    expect(mockRepo.delete).toHaveBeenCalledWith("ra-1", expect.anything());
  });
});
