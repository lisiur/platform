import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  },
}));

vi.mock("../ledger.repository", () => ({
  ledgerRepository: {
    findById: vi.fn(),
  },
  lockLedgerRow: vi.fn(),
}));

vi.mock("../account.repository", () => ({
  accountRepository: {
    findById: vi.fn(),
    update: vi.fn(),
    findAncestorIds: vi.fn(),
    countActiveChildren: vi.fn(),
  },
}));

import { accountRepository } from "../account.repository";
import { updateAccount } from "../account.service";
import { ledgerRepository } from "../ledger.repository";

const mockLedgerRepo = ledgerRepository as unknown as {
  findById: ReturnType<typeof vi.fn>;
};
const mockAccountRepo = accountRepository as unknown as {
  findById: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const LEDGER = { id: "led-1", ownerId: "user-a", status: "active" };

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "acc-1",
    ledgerId: "led-1",
    name: null,
    code: null,
    type: "asset",
    status: "active",
    flags: [],
    ...overrides,
  };
}

describe("updateAccount name-override handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue(LEDGER);
    mockAccountRepo.findById.mockResolvedValue(account());
    mockAccountRepo.update.mockResolvedValue(account());
  });

  it("renames a seeded account without touching its code (name overrides the label)", async () => {
    mockAccountRepo.findById.mockResolvedValue(account({ code: "cash" }));
    await updateAccount("user-a", "led-1", "acc-1", { name: "My Wallet" });
    expect(mockAccountRepo.update).toHaveBeenCalledWith(
      "acc-1",
      { name: "My Wallet" },
      expect.anything(),
    );
  });

  it("reverts to the localized label on an empty/null name (coded accounts)", async () => {
    mockAccountRepo.findById.mockResolvedValue(
      account({ code: "cash", name: "My Wallet" }),
    );
    await updateAccount("user-a", "led-1", "acc-1", { name: null });
    expect(mockAccountRepo.update).toHaveBeenCalledWith(
      "acc-1",
      { name: null },
      expect.anything(),
    );
  });

  it("keeps the name untouched when the patch omits it", async () => {
    await updateAccount("user-a", "led-1", "acc-1", { icon: "💰" });
    expect(mockAccountRepo.update).toHaveBeenCalledWith(
      "acc-1",
      { icon: "💰" },
      expect.anything(),
    );
  });

  it("rejects clearing the name on a user-created account (no code, nothing to render)", async () => {
    mockAccountRepo.findById.mockResolvedValue(account({ name: "Wallet" }));
    const err = await updateAccount("user-a", "led-1", "acc-1", {
      name: "",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { status: number }).status).toBe(400);
    expect(mockAccountRepo.update).not.toHaveBeenCalled();
  });
});
