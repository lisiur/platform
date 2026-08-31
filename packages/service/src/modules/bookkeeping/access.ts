import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { type LedgerRole, roleAtLeast } from "./domain";
import { ledgerRepository } from "./ledger.repository";
import { ledgerMemberRepository } from "./ledger-member.repository";
import { projectRepository } from "./project.repository";
import { projectMemberRepository } from "./project-member.repository";

export type LedgerAccess = {
  ledger: { id: string; ownerId: string; status: string; name: string };
  membership: { role: LedgerRole };
};

/**
 * Guard for ledger-scoped routes. Non-members get a 404 (no existence leak),
 * members below the minimum role get a 403.
 *
 * Pass minRole "guest" for "any member" — guests are ledger members whose
 * visibility is instead scoped by the project helpers below.
 */
export async function requireLedgerAccess(
  userId: string,
  ledgerId: string,
  minRole: LedgerRole,
): Promise<LedgerAccess> {
  const membership = await ledgerMemberRepository.findMembership(
    ledgerId,
    userId,
  );
  if (!membership) {
    throw new HTTPException(404, { message: "Ledger not found" });
  }
  if (!roleAtLeast(membership.role, minRole)) {
    throw new HTTPException(403, {
      message: `This action requires the ${minRole} role or higher`,
    });
  }
  const ledger = await ledgerRepository.findById(ledgerId);
  if (!ledger) {
    throw new HTTPException(404, { message: "Ledger not found" });
  }
  return {
    ledger: {
      id: ledger.id,
      ownerId: ledger.ownerId,
      status: ledger.status,
      name: ledger.name,
    },
    membership: { role: membership.role as LedgerRole },
  };
}

/** Rejects writes against archived ledgers. */
export function assertLedgerWritable(ledger: { status: string }): void {
  if (ledger.status !== "active") {
    throw new HTTPException(400, { message: "This ledger is archived" });
  }
}

export type ProjectAccess = {
  project: {
    id: string;
    ledgerId: string;
    name: string;
    status: string;
  };
  ledger: LedgerAccess["ledger"];
  /** Caller's ledger role — "guest" when access comes via the project row. */
  role: LedgerRole;
};

/**
 * Guard for project-scoped routes. Access comes from either a full ledger
 * role (owner/editor/viewer) or an explicit ProjectMember row; anyone else
 * gets a 404 (no existence leak, same policy as `requireLedgerAccess`).
 */
export async function requireProjectAccess(
  userId: string,
  projectId: string,
  minRole: LedgerRole = "guest",
): Promise<ProjectAccess> {
  const project = await projectRepository.findById(projectId);
  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }
  const membership = await ledgerMemberRepository.findMembership(
    project.ledgerId,
    userId,
  );
  if (!membership) {
    throw new HTTPException(404, { message: "Project not found" });
  }
  const role = membership.role as LedgerRole;
  if (role === "guest") {
    // Guests never satisfy a higher minimum — project routes cap them at
    // read/participate actions regardless of their ProjectMember row.
    if (minRole !== "guest") {
      throw new HTTPException(403, {
        message: `This action requires the ${minRole} role or higher`,
      });
    }
    const projectMember = await projectMemberRepository.findMembership(
      projectId,
      userId,
    );
    if (!projectMember) {
      throw new HTTPException(404, { message: "Project not found" });
    }
  } else if (!roleAtLeast(role, minRole)) {
    throw new HTTPException(403, {
      message: `This action requires the ${minRole} role or higher`,
    });
  }
  const ledger = await ledgerRepository.findById(project.ledgerId);
  if (!ledger) {
    throw new HTTPException(404, { message: "Ledger not found" });
  }
  return {
    project: {
      id: project.id,
      ledgerId: project.ledgerId,
      name: project.name,
      status: project.status,
    },
    ledger: {
      id: ledger.id,
      ownerId: ledger.ownerId,
      status: ledger.status,
      name: ledger.name,
    },
    role,
  };
}

/**
 * The entry-visibility scope for a member: undefined means "whole ledger"
 * (full roles); an id list means "only these projects" (guests). A guest
 * with no projects sees nothing — the empty list is still a filter.
 */
export async function entryScopeProjectIds(
  userId: string,
  access: LedgerAccess,
): Promise<string[] | undefined> {
  if (access.membership.role !== "guest") return undefined;
  const rows = await projectMemberRepository.listProjectIdsForUser(
    access.ledger.id,
    userId,
  );
  return rows.map((r) => r.projectId);
}

/**
 * Resolves the effective `projectId` filter for entry queries. Full roles
 * get their requested filter (or none). Guests are clamped to their own
 * projects: a requested foreign project 404s (no existence leak), no
 * request means "all of their projects" (possibly none).
 */
export async function resolveEntryProjectFilter(
  userId: string,
  access: LedgerAccess,
  requestedProjectId?: string,
): Promise<{ projectId?: string; scopeProjectIds?: string[] }> {
  const scope = await entryScopeProjectIds(userId, access);
  if (scope === undefined) {
    return { projectId: requestedProjectId };
  }
  if (requestedProjectId) {
    if (!scope.includes(requestedProjectId)) {
      throw new HTTPException(404, { message: "Project not found" });
    }
    return { projectId: requestedProjectId };
  }
  return { scopeProjectIds: scope };
}

/**
 * Guest write scope: the only projects a guest may post into are their own.
 * Full roles may target any project of the ledger (or none). Returns the
 * validated projectId (or undefined when omitted). Runs inside the caller's
 * transaction so the membership check is lock-consistent.
 */
export async function resolveEntryProjectTarget(
  tx: Prisma.TransactionClient,
  userId: string,
  access: LedgerAccess,
  projectId?: string | null,
): Promise<string | undefined> {
  if (!projectId) {
    if (access.membership.role === "guest") {
      throw new HTTPException(403, {
        message: "Guests must assign the entry to one of their projects",
      });
    }
    return undefined;
  }
  const project = await projectRepository.findById(projectId, tx);
  if (!project || project.ledgerId !== access.ledger.id) {
    throw new HTTPException(404, { message: "Project not found" });
  }
  if (project.status !== "active") {
    throw new HTTPException(400, { message: "This project is archived" });
  }
  if (access.membership.role === "guest") {
    const membership = await projectMemberRepository.findMembership(
      projectId,
      userId,
      tx,
    );
    if (!membership) {
      throw new HTTPException(404, { message: "Project not found" });
    }
  }
  return projectId;
}
