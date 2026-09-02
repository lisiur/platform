import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { assertLedgerWritable } from "./access";
import { compareLedgerRole, type LedgerRole } from "./domain";
import {
  type InviteRole,
  mintInviteToken,
  verifyInviteToken,
} from "./invite-token";
import { ledgerRepository, lockLedgerRow } from "./ledger.repository";
import { ledgerMemberRepository } from "./ledger-member.repository";
import { isForeignKeyViolation } from "./prisma-errors";
import { projectRepository } from "./project.repository";
import { projectMemberRepository } from "./project-member.repository";

/**
 * Runs under the ledger row lock (like every other ledger writer): the
 * route's ownership/writability check sees a pre-transaction snapshot, so a
 * concurrent archive or ownership transfer between the check and the mint
 * must not hand out an invite for an archived or ex-owned ledger.
 *
 * With `projectId` the invite is project-scoped: redeeming grants a `guest`
 * ledger membership scoped to that project (the `role` claim is "guest").
 * Ledger-wide invites keep the owner-only rule; project invites may be
 * minted by editors and above.
 *
 * The returned "share code" IS the signed JWT — no row is stored anywhere.
 * It expires after INVITE_TTL_SECONDS and cannot be listed or revoked.
 */
export async function createShareCode(
  ledgerId: string,
  createdById: string,
  data: {
    role: string;
    projectId?: string | null;
  },
) {
  if (data.projectId) {
    if (data.role !== "guest") {
      throw new HTTPException(400, {
        message: "Project share codes always grant the guest role",
      });
    }
  } else if (data.role !== "editor" && data.role !== "viewer") {
    throw new HTTPException(400, {
      message: "Share code role must be editor or viewer",
    });
  }
  const minted = await prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    const ledger = await ledgerRepository.findById(ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    const membership = await ledgerMemberRepository.findMembership(
      ledgerId,
      createdById,
      tx,
    );
    // Project codes: editors and above. Ledger-wide codes: owner only,
    // re-verified under the lock.
    if (data.projectId) {
      if (
        !membership ||
        membership.role === "guest" ||
        membership.role === "viewer"
      ) {
        throw new HTTPException(403, {
          message: "This action requires the editor role or higher",
        });
      }
      const project = await projectRepository.findById(data.projectId, tx);
      if (!project || project.ledgerId !== ledgerId) {
        throw new HTTPException(404, { message: "Project not found" });
      }
      if (project.status !== "active") {
        throw new HTTPException(400, { message: "This project is archived" });
      }
    } else {
      if (ledger.ownerId !== createdById) {
        throw new HTTPException(403, {
          message: "Only the ledger owner can perform this action",
        });
      }
    }
    assertLedgerWritable(ledger);
    return mintInviteToken({
      sub: createdById,
      ledgerId,
      ...(data.projectId ? { projectId: data.projectId } : {}),
      role: data.role as InviteRole,
    });
  });
  return {
    ledgerId,
    code: minted.token,
    role: data.role as InviteRole,
    projectId: data.projectId ?? null,
    expiresAt: minted.expiresAt,
    createdAt: new Date(),
  };
}

/**
 * Redeems an invite code: verifies the JWT signature, audience, and expiry
 * (exp is enforced by verification itself), then grants access under the
 * ledger row lock.
 *
 * Ledger-wide invites add the redeemer as an editor/viewer member (existing
 * member → 400; owner redeeming own ledger → 400). Project invites grant the
 * `guest` ledger role plus a ProjectMember row: an existing member of any
 * role just gains the project; an outsider becomes a guest first.
 *
 * Only the ledger row lock remains from the stored-code flow — codes need no
 * row locking or usage counting, and ledger deletion serializes through the
 * same ledger-first lock order as `deleteLedger`.
 */
export async function redeemShareCode(userId: string, codeStr: string) {
  const claims = await verifyInviteToken(codeStr);
  return prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, claims.ledgerId);
    const ledger = await ledgerRepository.findById(claims.ledgerId, tx);
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
      claims.ledgerId,
      userId,
      tx,
    );
    if (claims.projectId) {
      const project = await projectRepository.findById(claims.projectId, tx);
      if (!project || project.ledgerId !== claims.ledgerId) {
        throw new HTTPException(404, { message: "Project not found" });
      }
      if (project.status !== "active") {
        throw new HTTPException(400, { message: "This project is archived" });
      }
      const projectMember = await projectMemberRepository.findMembership(
        claims.projectId,
        userId,
        tx,
      );
      if (projectMember) {
        throw new HTTPException(400, {
          message: "You are already a member of this project",
        });
      }
      try {
        if (!existing) {
          await ledgerMemberRepository.create(
            { ledgerId: claims.ledgerId, userId, role: "guest" },
            tx,
          );
        }
        await projectMemberRepository.create(
          { projectId: claims.projectId, userId },
          tx,
        );
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          throw new HTTPException(404, { message: "Ledger not found" });
        }
        throw err;
      }
      return {
        ledgerId: claims.ledgerId,
        projectId: claims.projectId,
        role: existing?.role ?? "guest",
      };
    }
    if (existing) {
      throw new HTTPException(400, {
        message: "You are already a member of this ledger",
      });
    }
    try {
      await ledgerMemberRepository.create(
        { ledgerId: claims.ledgerId, userId, role: claims.role },
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
    return { ledgerId: claims.ledgerId, role: claims.role };
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

/**
 * Roster of a ledger, scoped by the viewer's role:
 * - full roles (owner/editor/viewer) see the whole roster;
 * - guests see only members sharing at least one project with them — the
 *   same project-scoped visibility their entries have, so a guest can pick
 *   settlement participants for their projects but can't harvest the full
 *   ledger roster.
 * Only owners see co-members' email addresses (see `redactMemberEmail`).
 */
export async function listMembers(
  ledgerId: string,
  viewer: { userId: string; role: LedgerRole },
) {
  const all = await ledgerMemberRepository.listByLedger(ledgerId);
  const members =
    viewer.role === "guest"
      ? await scopeRosterToSharedProjects(ledgerId, viewer.userId, all)
      : all;
  // Prisma's `orderBy: role` is lexicographic (editor < owner < viewer), so we
  // re-sort here by ROLE_RANK to get the intended owner → editor → viewer
  // display order. Ties fall back to the repository's createdAt order.
  members.sort(
    (a, b) =>
      compareLedgerRole(a.role, b.role) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const showEmail = viewer.role === "owner";
  return {
    members: members.map((m) => redactMemberEmail(m, showEmail)),
  };
}

/** Narrows a roster to members sharing ≥1 project with the viewer. */
async function scopeRosterToSharedProjects(
  ledgerId: string,
  viewerUserId: string,
  members: Awaited<ReturnType<typeof ledgerMemberRepository.listByLedger>>,
) {
  const rows = await projectMemberRepository.listSharedMemberUserIds(
    ledgerId,
    viewerUserId,
  );
  const sharedUserIds = new Set(rows.map((r) => r.userId));
  return members.filter((m) => sharedUserIds.has(m.userId));
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
    // Ledger membership ends → project memberships inside it end too.
    await projectMemberRepository.deleteAllInLedger(ledgerId, targetUserId, tx);
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
    // Leaving the ledger leaves its projects too.
    await projectMemberRepository.deleteAllInLedger(ledgerId, userId, tx);
    await ledgerMemberRepository.delete(ledgerId, userId, tx);
  });
  return { success: true as const };
}
