import { ORG_MEMBER_ROLE_CODE, ORG_OWNER_ROLE_CODE } from "@repo/shared";
import type { Prisma, PrismaClient } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import {
  ORG_PERMISSION_SCOPE,
  ORG_SCOPE_PREFIX,
  orgScope,
  permissionWhereByScope,
  roleCodeAtScope,
} from "#lib/scope";

export type OrgRole = "owner" | "member";

/**
 * Fixed permission codes granted to every org's "member" role. The owner role
 * receives every `org/...` permission (resolved at provisioning time).
 */
export const ORG_MEMBER_PERMISSION_CODES = [
  "org/dashboard:view",
  "org/organization-member:list",
  "org/department:list",
  "org/agent:chat",
];

const ownerRoleCode = (organizationId: string) =>
  roleCodeAtScope(orgScope(organizationId), ORG_OWNER_ROLE_CODE);
const memberRoleCode = (organizationId: string) =>
  roleCodeAtScope(orgScope(organizationId), ORG_MEMBER_ROLE_CODE);

async function syncRolePermissions(
  tx: PrismaClient | Prisma.TransactionClient,
  roleId: string,
  permissionIds: string[],
) {
  await tx.rolePermission.deleteMany({ where: { roleId } });
  if (permissionIds.length > 0) {
    await tx.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
    });
  }
}

/**
 * Provisions the per-org role rows (owner + member) and links them to the
 * shared org-permission catalog. Owner receives every `org/...` permission;
 * member receives {@link ORG_MEMBER_PERMISSION_CODES}. Idempotent. Returns the
 * provisioned role ids so the caller can assign the creator to "owner".
 */
export async function provisionOrgRoles(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
): Promise<{ ownerRoleId: string; memberRoleId: string }> {
  const ownerRole = await tx.role.upsert({
    where: { code: ownerRoleCode(organizationId) },
    update: { name: "Owner", flags: ["builtin"] },
    create: {
      code: ownerRoleCode(organizationId),
      name: "Owner",
      flags: ["builtin"],
    },
  });
  const memberRole = await tx.role.upsert({
    where: { code: memberRoleCode(organizationId) },
    update: { name: "Member", flags: ["builtin"] },
    create: {
      code: memberRoleCode(organizationId),
      name: "Member",
      flags: ["builtin"],
    },
  });

  const orgPerms = await tx.permission.findMany({
    where: permissionWhereByScope(ORG_PERMISSION_SCOPE),
    select: { id: true },
  });
  await syncRolePermissions(
    tx,
    ownerRole.id,
    orgPerms.map((p) => p.id),
  );

  const memberPerms = await tx.permission.findMany({
    where: { code: { in: ORG_MEMBER_PERMISSION_CODES } },
    select: { id: true },
  });
  await syncRolePermissions(
    tx,
    memberRole.id,
    memberPerms.map((p) => p.id),
  );

  return { ownerRoleId: ownerRole.id, memberRoleId: memberRole.id };
}

export const orgOwnerAssignmentWhere = (organizationId: string) => ({
  role: { code: ownerRoleCode(organizationId) },
});

export function countOrgOwners(organizationId: string): Promise<number> {
  return prisma.roleAssignment.count({
    where: orgOwnerAssignmentWhere(organizationId),
  });
}

export async function isOrgOwner(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const count = await prisma.roleAssignment.count({
    where: { userId, ...orgOwnerAssignmentWhere(organizationId) },
  });
  return count > 0;
}

export async function getUserOrgRole(
  userId: string,
  organizationId: string,
): Promise<OrgRole> {
  return (await isOrgOwner(userId, organizationId)) ? "owner" : "member";
}

export async function getOrgOwnerUserIds(
  organizationId: string,
): Promise<Set<string>> {
  const rows = await prisma.roleAssignment.findMany({
    where: orgOwnerAssignmentWhere(organizationId),
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

export async function getOrgOwners(
  organizationIds: string[],
): Promise<Map<string, { id: string; name: string; email: string | null }>> {
  if (organizationIds.length === 0) return new Map();
  const codes = organizationIds.map(ownerRoleCode);
  const rows = await prisma.roleAssignment.findMany({
    where: { role: { code: { in: codes } } },
    select: {
      role: { select: { code: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const owners = new Map<
    string,
    { id: string; name: string; email: string | null }
  >();
  for (const row of rows) {
    // role.code = "org:<orgId>/owner" → extract the org id from its scope.
    const scopeSegment = row.role.code.slice(0, row.role.code.lastIndexOf("/"));
    const orgId = scopeSegment.startsWith(ORG_SCOPE_PREFIX)
      ? scopeSegment.slice(ORG_SCOPE_PREFIX.length)
      : scopeSegment;
    if (!owners.has(orgId)) {
      owners.set(orgId, row.user);
    }
  }
  return owners;
}
