import { isVirtualUser, VIRTUAL_USER_FLAG } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { userLookupRepository } from "../identity/user-lookup.repository";
import { assertLedgerWritable } from "./access";
import { compareLedgerRole, type LedgerRole, roleAtLeast } from "./domain";
import {
  type InviteRole,
  mintInviteToken,
  verifyInviteToken,
} from "./invite-token";
import { journalRepository } from "./journal.repository";
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

/** Abuse cap: virtual rows live in the global users table, so a ledger can
 *  only accumulate so many (people who'll never sign in anyway). */
export const MAX_VIRTUAL_MEMBERS_PER_LEDGER = 50;

/**
 * Adds a member directly, without an invitation: the person (a child, or
 * someone who won't install the app) never registers. The virtual member is
 * a flag-marked User row with no email and no credential Account — it can
 * never sign in — plus a viewer LedgerMember row, so every roster check,
 * payer/participant tag, and settlement computation treats it like any other
 * member. Claiming it later means attaching a credential Account to the row
 * and clearing the flag.
 */
export async function createVirtualMember(
  ledgerId: string,
  actingUserId: string,
  name: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    const ledger = await ledgerRepository.findById(ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    if (ledger.status !== "active") {
      throw new HTTPException(400, { message: "This ledger is archived" });
    }
    const membership = await ledgerMemberRepository.findMembership(
      ledgerId,
      actingUserId,
      tx,
    );
    if (!membership || !roleAtLeast(membership.role, "editor")) {
      throw new HTTPException(403, {
        message: "This action requires the editor role or higher",
      });
    }
    const members = await ledgerMemberRepository.listByLedger(ledgerId, tx);
    if (
      members.filter((m) => isVirtualUser(m.user?.flags)).length >=
      MAX_VIRTUAL_MEMBERS_PER_LEDGER
    ) {
      throw new HTTPException(400, {
        message: `This ledger already has the maximum of ${MAX_VIRTUAL_MEMBERS_PER_LEDGER} virtual members`,
      });
    }
    const user = await tx.user.create({
      data: { name, flags: [VIRTUAL_USER_FLAG] },
    });
    try {
      const member = await ledgerMemberRepository.create(
        { ledgerId, userId: user.id, role: "viewer" },
        tx,
      );
      return {
        id: member.id,
        ledgerId,
        userId: user.id,
        role: "viewer" as const,
        createdAt: member.createdAt,
        user: {
          id: user.id,
          name: user.name,
          email: null,
          avatar: null,
          isVirtual: true,
        },
      };
    } catch (err) {
      // Same defense-in-depth as redeemShareCode: an unforeseen path that
      // drops the ledger mid-transaction surfaces as a clean 404.
      if (isForeignKeyViolation(err)) {
        throw new HTTPException(404, { message: "Ledger not found" });
      }
      throw err;
    }
  });
}

type RosterUser = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  flags?: string[];
};

/**
 * API shape for a roster row: derives `isVirtual` from the user's flags and
 * strips the raw flags (internal detail, never serialized). Mirrors the
 * email policy — only owners see co-members' email addresses; redeemers
 * shouldn't be able to harvest emails of everyone else on a shared ledger.
 */
function toRosterMember<M extends { user?: RosterUser | null; role: string }>(
  member: M,
  showEmail: boolean,
) {
  const { user, ...rest } = member;
  return {
    ...rest,
    user: user
      ? {
          id: user.id,
          name: user.name,
          email: showEmail ? user.email : null,
          avatar: user.avatar,
          ...(isVirtualUser(user.flags) ? { isVirtual: true } : {}),
        }
      : null,
  };
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
    members: members.map((m) => toRosterMember(m, showEmail)),
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
    // A virtual member has no account worth keeping. Once nothing anchors to
    // its User row (no entry it paid/created, no participant tag, no
    // membership in some other ledger) — say, a typo'd add — delete the row
    // too; referenced rows survive as the departed-member name source for
    // historical settlement, same as real users whose membership is gone.
    if (
      isVirtualUser(
        (await userLookupRepository.findFlagsById(targetUserId, tx))?.flags,
      )
    ) {
      const [anchors, tags, memberships] = await Promise.all([
        journalRepository.countEntriesAnchoringUser(targetUserId, tx),
        journalRepository.countParticipationsByUser(targetUserId, tx),
        ledgerMemberRepository.countMembershipsByUser(targetUserId, tx),
      ]);
      if (anchors === 0 && tags === 0 && memberships === 0) {
        await userLookupRepository.deleteById(targetUserId, tx);
      }
    }
  });
  return { success: true as const };
}

/**
 * Updates a member. Two capabilities on one endpoint, each with its own
 * permission:
 * - `role` (owner-only): switch a real member between editor and viewer. The
 *   owner row is untouchable — transfer ownership instead. Virtual members
 *   are refused a fixed "viewer".
 * - `name` (editor+): rename a virtual member — real users own their account
 *   names.
 *
 * Re-verifies actor and target under the ledger row lock so a concurrent
 * `transferOwnership` can't demote the actor or promote the target
 * mid-change.
 */
export async function updateMember(
  ledgerId: string,
  actingUserId: string,
  targetUserId: string,
  data: { role?: string; name?: string },
) {
  const { role, name } = data;
  if (role === undefined && name === undefined) {
    throw new HTTPException(400, {
      message: "Provide a role or a name to update",
    });
  }
  // The two capabilities target disjoint member kinds (role: real members,
  // name: virtual ones), so a body carrying both could never apply.
  if (role !== undefined && name !== undefined) {
    throw new HTTPException(400, {
      message: "Provide a role or a name to update, not both",
    });
  }
  if (role !== undefined && role !== "editor" && role !== "viewer") {
    throw new HTTPException(400, {
      message: "Member role must be editor or viewer",
    });
  }
  if (role !== undefined && actingUserId === targetUserId) {
    throw new HTTPException(400, {
      message: "You cannot change your own role; transfer ownership instead",
    });
  }
  await prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    // The route floor is editor; role changes re-verify owner here under the
    // lock (the route's snapshot can't see a concurrent demotion).
    const actor = await ledgerMemberRepository.findMembership(
      ledgerId,
      actingUserId,
      tx,
    );
    if (!actor || !roleAtLeast(actor.role, "editor")) {
      throw new HTTPException(403, {
        message: "This action requires the editor role or higher",
      });
    }
    const target = await ledgerMemberRepository.findMembership(
      ledgerId,
      targetUserId,
      tx,
    );
    if (!target) {
      throw new HTTPException(404, { message: "Member not found" });
    }
    const targetIsVirtual = isVirtualUser(
      (await userLookupRepository.findFlagsById(targetUserId, tx))?.flags,
    );
    if (role !== undefined) {
      if (actor.role !== "owner") {
        throw new HTTPException(403, {
          message: "Only the ledger owner can perform this action",
        });
      }
      if (target.role === "owner") {
        throw new HTTPException(400, {
          message:
            "The owner's role cannot be changed; transfer ownership instead",
        });
      }
      if (targetIsVirtual) {
        throw new HTTPException(400, {
          message: "Virtual members have a fixed role",
        });
      }
      await ledgerMemberRepository.updateRole(ledgerId, targetUserId, role, tx);
    }
    if (name !== undefined) {
      if (!targetIsVirtual) {
        throw new HTTPException(400, {
          message: "Only virtual members can be renamed",
        });
      }
      await userLookupRepository.renameById(targetUserId, name, tx);
    }
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
    // A virtual member can never sign in, so handing it ownership would
    // strand the ledger behind an owner nobody can act as.
    if (
      isVirtualUser(
        (await userLookupRepository.findFlagsById(targetUserId, tx))?.flags,
      )
    ) {
      throw new HTTPException(400, {
        message: "A virtual member cannot own the ledger",
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
