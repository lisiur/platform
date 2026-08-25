import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { REAL_ACCOUNT_TYPES, type RealAccountType } from "./domain";
import { realAccountRepository } from "./real-account.repository";

function parseRealAccountType(value: string): RealAccountType {
  const type = REAL_ACCOUNT_TYPES.find((t) => t === value);
  if (!type) {
    throw new HTTPException(400, {
      message: `Real account type must be one of: ${REAL_ACCOUNT_TYPES.join(", ")}`,
    });
  }
  return type;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Debit-normal for assets, credit-normal for liabilities. */
function signedBalance(type: string, debit: number, credit: number): number {
  return type === "asset" ? round(debit - credit) : round(credit - debit);
}

/**
 * 404 on missing OR foreign real accounts — same no-existence-leak policy
 * as ledger access. Owner-scoped endpoints never reveal whose id exists.
 */
async function requireOwnedRealAccount(ownerId: string, id: string) {
  const real = await realAccountRepository.findById(id);
  if (!real || real.ownerId !== ownerId) {
    throw new HTTPException(404, { message: "Real account not found" });
  }
  return real;
}

/**
 * Owner-private cross-ledger net-worth view: every real account with its
 * membership-visible pockets, each pocket's in-ledger balance, per-master
 * totals, and grand totals. Archived masters stay listed but drop out of
 * the totals. All figures derive from journal lines scoped to the owner's
 * own pockets — nothing from other members' private pockets can appear.
 */
export async function listRealAccounts(ownerId: string) {
  const [realAccounts, grouped] = await Promise.all([
    realAccountRepository.listWithPockets(ownerId),
    realAccountRepository.sumLinesByOwnerPockets(ownerId),
  ]);
  const sums = new Map(
    grouped.map((row) => [
      row.accountId,
      {
        debit: Number(row._sum.debit ?? 0),
        credit: Number(row._sum.credit ?? 0),
      },
    ]),
  );

  let assets = 0;
  let liabilities = 0;
  const rows = realAccounts.map((real) => {
    const pockets = real.pockets.map((pocket) => {
      const { debit = 0, credit = 0 } = sums.get(pocket.id) ?? {};
      return {
        id: pocket.id,
        ledgerId: pocket.ledgerId,
        ledgerName: pocket.ledger.name,
        ledgerStatus: pocket.ledger.status as "active" | "archived",
        name: pocket.name,
        code: pocket.code,
        type: pocket.type as RealAccountType,
        status: pocket.status as "active" | "archived",
        icon: pocket.icon,
        balance: signedBalance(pocket.type, debit, credit),
      };
    });
    const balance = round(
      pockets.reduce((acc, pocket) => acc + pocket.balance, 0),
    );
    if (real.status === "active") {
      if (real.type === "asset") {
        assets += balance;
      } else {
        liabilities += balance;
      }
    }
    return {
      id: real.id,
      name: real.name,
      type: real.type as RealAccountType,
      status: real.status as "active" | "archived",
      icon: real.icon,
      meta: real.meta as Record<string, unknown> | null,
      balance,
      pockets,
      createdAt: real.createdAt,
      updatedAt: real.updatedAt,
    };
  });

  return {
    realAccounts: rows,
    totals: {
      assets: round(assets),
      liabilities: round(liabilities),
      netWorth: round(assets - liabilities),
    },
  };
}

export async function createRealAccount(
  ownerId: string,
  data: {
    name: string;
    type: string;
    icon?: string | null;
    meta?: Record<string, unknown> | null;
  },
) {
  const type = parseRealAccountType(data.type);
  return realAccountRepository.create({ ...data, type, ownerId });
}

export async function updateRealAccount(
  ownerId: string,
  id: string,
  data: {
    name?: string;
    status?: string;
    icon?: string | null;
    meta?: Record<string, unknown> | null;
  },
) {
  await requireOwnedRealAccount(ownerId, id);
  return realAccountRepository.update(id, data);
}

/**
 * Deleting a master with linked pockets is refused — pockets would keep
 * journal lines while silently losing their roll-up. The row lock (shared
 * with linking, see requireLinkableRealAccount) serializes the pocket-count
 * guard against concurrent links, so SetNull never has to fire in practice.
 */
export async function deleteRealAccount(ownerId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const real = await realAccountRepository.lockById(id, tx);
    if (!real || real.ownerId !== ownerId) {
      throw new HTTPException(404, { message: "Real account not found" });
    }
    const pocketCount = await realAccountRepository.countPockets(id, tx);
    if (pocketCount > 0) {
      throw new HTTPException(409, {
        message: "Unlink this real account's pockets before deleting it",
      });
    }
    await realAccountRepository.delete(id, tx);
    return { success: true as const };
  });
}
