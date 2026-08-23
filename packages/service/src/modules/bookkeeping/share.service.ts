import { randomBytes } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { assertLedgerWritable } from "./access";
import { compareLedgerRole, type LedgerRole, type ShareRole } from "./domain";
import { ledgerRepository, lockLedgerRow } from "./ledger.repository";
import { ledgerMemberRepository } from "./ledger-member.repository";
import { isForeignKeyViolation } from "./prisma-errors";
import { shareCodeRepository } from "./share-code.repository";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = randomBytes(12);
  let code = "";
  for (let i = 0; i < 12; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

async function ensureUniqueCode(
  code: string,
  tx: Prisma.TransactionClient,
): Promise<string> {
  const existing = await shareCodeRepository.findByCode(code, tx);
  if (!existing) return code;
  return ensureUniqueCode(generateCode(), tx);
}

export async function listShareCodes(ledgerId: string) {
  const codes = await shareCodeRepository.listByLedger(ledgerId);
  return { codes };
}

/**
 * Runs under the ledger row lock (like every other ledger writer): the
 * route's ownership/writability check sees a pre-transaction snapshot, so a
 * concurrent archive or ownership transfer between the check and the insert
 * must not slip a share code onto an archived or ex-owned ledger.
 */
export async function createShareCode(
  ledgerId: string,
  createdById: string,
  data: { role: string; expiresAt?: Date | null; maxUses?: number | null },
) {
  if (data.role !== "editor" && data.role !== "viewer") {
    throw new HTTPException(400, {
      message: "Share code role must be editor or viewer",
    });
  }
  if (data.maxUses !== undefined && data.maxUses !== null && data.maxUses < 1) {
    throw new HTTPException(400, {
      message: "maxUses must be at least 1",
    });
  }
  if (data.expiresAt && data.expiresAt.getTime() <= Date.now()) {
    throw new HTTPException(400, {
      message: "expiresAt must be in the future",
    });
  }
  return prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    const ledger = await ledgerRepository.findById(ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    if (ledger.ownerId !== createdById) {
      throw new HTTPException(403, {
        message: "Only the ledger owner can perform this action",
      });
    }
    assertLedgerWritable(ledger);
    const code = await ensureUniqueCode(generateCode(), tx);
    return shareCodeRepository.create(
      {
        ledgerId,
        code,
        role: data.role as ShareRole,
        expiresAt: data.expiresAt ?? null,
        maxUses: data.maxUses ?? null,
        createdById,
      },
      tx,
    );
  });
}

export async function revokeShareCode(ledgerId: string, codeId: string) {
  const code = await shareCodeRepository.findById(codeId);
  if (!code || code.ledgerId !== ledgerId) {
    throw new HTTPException(404, { message: "Share code not found" });
  }
  await shareCodeRepository.revoke(codeId);
  return { success: true as const };
}

/**
 * Redeems a share code: validates status/expiry/usage cap with the code row
 * locked (FOR UPDATE), then adds the redeemer as a ledger member. Mirrors the
 * redeem-code flow: already a member → 400; owner redeeming own ledger → 400.
 *
 * Locks are taken ledger-first, then code — the same order `deleteLedger`
 * takes (ledger row, then its cascade to share codes), so a concurrent ledger
 * deletion serializes instead of deadlocking, and the ledger/archived checks
 * run under the lock like every other ledger writer.
 */
export async function redeemShareCode(userId: string, codeStr: string) {
  return prisma.$transaction(async (tx) => {
    // Unlocked peek to learn which ledger the code belongs to.
    const peek = await shareCodeRepository.findByCode(codeStr, tx);
    if (!peek) {
      throw new HTTPException(404, { message: "Share code not found" });
    }
    await lockLedgerRow(tx, peek.ledgerId);
    await tx.$queryRaw`SELECT * FROM "qianlai_ledger_share_code" WHERE "code" = ${codeStr} FOR UPDATE`;
    const code = await shareCodeRepository.findByCode(codeStr, tx);
    if (!code) {
      throw new HTTPException(404, { message: "Share code not found" });
    }
    if (code.status !== "active") {
      throw new HTTPException(400, { message: "This share code was revoked" });
    }
    if (code.expiresAt && code.expiresAt < new Date()) {
      throw new HTTPException(400, { message: "This share code has expired" });
    }
    if (code.maxUses !== null && code.usesCount >= code.maxUses) {
      throw new HTTPException(400, {
        message: "This share code has reached its usage limit",
      });
    }
    const ledger = await ledgerRepository.findById(code.ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    if (ledger.status !== "active") {
      throw new HTTPException(400, { message: "This ledger is archived" });
    }
    if (ledger.ownerId === userId) {
      throw new HTTPException(400, {
        message: "You already own this ledger",
      });
    }
    const existing = await ledgerMemberRepository.findMembership(
      code.ledgerId,
      userId,
      tx,
    );
    if (existing) {
      throw new HTTPException(400, {
        message: "You are already a member of this ledger",
      });
    }
    try {
      await ledgerMemberRepository.create(
        { ledgerId: code.ledgerId, userId, role: code.role },
        tx,
      );
    } catch (err) {
      // Defense-in-depth on top of the ledger row lock: if the ledger (or the
      // redeemer's user row) vanishes through some unforeseen path, surface a
      // clean 404 instead of a raw FK 500.
      if (isForeignKeyViolation(err)) {
        throw new HTTPException(404, { message: "Ledger not found" });
      }
      throw err;
    }
    await shareCodeRepository.incrementUses(code.id, tx);
    return { ledgerId: code.ledgerId, role: code.role };
  });
}

/**
 * Only owners can see co-members' email addresses — redeemers shouldn't be
 * able to harvest emails of everyone else on a shared ledger.
 */
function redactMemberEmail<
  M extends { user?: { email: string | null } | null },
>(member: M, showEmail: boolean): M {
  return showEmail || !member.user
    ? member
    : { ...member, user: { ...member.user, email: null } };
}

export async function listMembers(ledgerId: string, viewerRole: LedgerRole) {
  const members = await ledgerMemberRepository.listByLedger(ledgerId);
  // Prisma's `orderBy: role` is lexicographic (editor < owner < viewer), so we
  // re-sort here by ROLE_RANK to get the intended owner → editor → viewer
  // display order. Ties fall back to the repository's createdAt order.
  members.sort(
    (a, b) =>
      compareLedgerRole(a.role, b.role) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const showEmail = viewerRole === "owner";
  return {
    members: members.map((m) => redactMemberEmail(m, showEmail)),
  };
}

/**
 * Removes a member. The whole check-then-delete runs under the ledger row
 * lock (like `transferOwnership`) so a concurrent ownership transfer can't
 * promote the target between the guard and the delete — deleting the new
 * owner's membership would orphan the ledger.
 */
export async function removeMember(ledgerId: string, targetUserId: string) {
  await prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    const target = await ledgerMemberRepository.findMembership(
      ledgerId,
      targetUserId,
      tx,
    );
    if (!target) {
      throw new HTTPException(404, { message: "Member not found" });
    }
    if (target.role === "owner") {
      throw new HTTPException(400, {
        message: "The owner cannot be removed; transfer ownership first",
      });
    }
    await ledgerMemberRepository.delete(ledgerId, targetUserId, tx);
  });
  return { success: true as const };
}

/**
 * Changes a member's role between editor and viewer. Owner-only and refuses
 * to touch the owner row — transfer ownership instead of demoting/altering it.
 * Re-verifies the target under the ledger row lock so a concurrent
 * `transferOwnership` can't make the target the owner mid-change.
 */
export async function updateMemberRole(
  ledgerId: string,
  actingUserId: string,
  targetUserId: string,
  role: string,
) {
  if (role !== "editor" && role !== "viewer") {
    throw new HTTPException(400, {
      message: "Member role must be editor or viewer",
    });
  }
  if (actingUserId === targetUserId) {
    throw new HTTPException(400, {
      message: "You cannot change your own role; transfer ownership instead",
    });
  }
  await prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    const target = await ledgerMemberRepository.findMembership(
      ledgerId,
      targetUserId,
      tx,
    );
    if (!target) {
      throw new HTTPException(404, { message: "Member not found" });
    }
    if (target.role === "owner") {
      throw new HTTPException(400, {
        message:
          "The owner's role cannot be changed; transfer ownership instead",
      });
    }
    await ledgerMemberRepository.updateRole(ledgerId, targetUserId, role, tx);
  });
  return { success: true as const };
}

/** Moves ownership to an existing member; the previous owner becomes editor. */
export async function transferOwnership(
  ledgerId: string,
  actingUserId: string,
  targetUserId: string,
) {
  if (actingUserId === targetUserId) {
    throw new HTTPException(400, {
      message: "You already own this ledger",
    });
  }
  await prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    // Re-verify both memberships under the lock: without this, two concurrent
    // transfers (double-click, retry) could both pass pre-checks and leave two
    // members holding the owner role.
    const actor = await ledgerMemberRepository.findMembership(
      ledgerId,
      actingUserId,
      tx,
    );
    if (actor?.role !== "owner") {
      throw new HTTPException(403, {
        message: "Only the ledger owner can perform this action",
      });
    }
    const target = await ledgerMemberRepository.findMembership(
      ledgerId,
      targetUserId,
      tx,
    );
    if (!target) {
      throw new HTTPException(404, {
        message: "Target user is not a member",
      });
    }
    await ledgerMemberRepository.updateRole(
      ledgerId,
      actingUserId,
      "editor",
      tx,
    );
    await ledgerMemberRepository.updateRole(
      ledgerId,
      targetUserId,
      "owner",
      tx,
    );
    await ledgerRepository.setOwner(ledgerId, targetUserId, tx);
    // The default flag is owner-scoped state; the new owner may already have
    // their own default, and two defaults (resolved by earliest createdAt)
    // would silently shadow it. Clear it — the new owner can opt in via
    // setDefaultLedger.
    await ledgerRepository.setDefault(ledgerId, false, tx);
  });
  return { success: true as const };
}

/**
 * Members may leave; owners must transfer or delete the ledger instead.
 * Re-verifies the role under the ledger row lock so a concurrent
 * `transferOwnership` can't leave the ledger ownerless when the departing
 * member was promoted mid-flight.
 */
export async function leaveLedger(ledgerId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    const membership = await ledgerMemberRepository.findMembership(
      ledgerId,
      userId,
      tx,
    );
    if (!membership) {
      throw new HTTPException(404, {
        message: "You are not a member of this ledger",
      });
    }
    if (membership.role === "owner") {
      throw new HTTPException(400, {
        message: "Owners cannot leave; transfer ownership or delete the ledger",
      });
    }
    await ledgerMemberRepository.delete(ledgerId, userId, tx);
  });
  return { success: true as const };
}
