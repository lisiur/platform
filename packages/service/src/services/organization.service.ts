import { ORG_OWNER_ROLE_CODE, ORGANIZATION_APP_CODE } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { getOrgOwners } from "#lib/org-role";
import { PLATFORM_SCOPE_ID, RoleScopeType } from "#lib/role-scope";

export async function getOrganizationById(id: string) {
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) {
    throw new HTTPException(404, { message: "Organization not found" });
  }
  return org;
}

export async function createOrganization(data: {
  name: string;
  slug: string;
  logo?: string;
  metadata?: string;
}) {
  const existing = await prisma.organization.findUnique({
    where: { slug: data.slug },
  });
  if (existing) {
    throw new HTTPException(409, { message: "Slug already taken" });
  }
  return prisma.organization.create({
    data: {
      ...data,
      createdAt: new Date(),
    },
  });
}

export async function registerOrganizationForUser(
  userId: string,
  data: {
    name: string;
    slug: string;
    logo?: string;
    metadata?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.organization.findUnique({
      where: { slug: data.slug },
    });
    if (existing) {
      throw new HTTPException(409, { message: "Slug already taken" });
    }

    const organization = await tx.organization.create({
      data: {
        ...data,
        createdAt: new Date(),
      },
    });

    await tx.member.upsert({
      where: {
        organizationId_userId: { organizationId: organization.id, userId },
      },
      update: {},
      create: {
        organizationId: organization.id,
        userId,
        createdAt: new Date(),
      },
    });

    const ownerRole = await tx.role.findUnique({
      where: {
        appId_scopeType_scopeId_code: {
          appId: ORGANIZATION_APP_CODE,
          scopeType: RoleScopeType.PLATFORM,
          scopeId: PLATFORM_SCOPE_ID,
          code: ORG_OWNER_ROLE_CODE,
        },
      },
      select: { id: true },
    });

    if (ownerRole) {
      await tx.roleAssignment.upsert({
        where: {
          userId_roleId_scopeType_scopeId: {
            userId,
            roleId: ownerRole.id,
            scopeType: RoleScopeType.ORGANIZATION,
            scopeId: organization.id,
          },
        },
        update: {},
        create: {
          userId,
          roleId: ownerRole.id,
          scopeType: RoleScopeType.ORGANIZATION,
          scopeId: organization.id,
        },
      });
    }

    return organization;
  });
}

export async function updateOrganization(
  id: string,
  data: {
    name?: string;
    slug?: string;
    logo?: string | null;
    metadata?: string | null;
  },
) {
  const existing = await prisma.organization.findUnique({ where: { id } });
  if (!existing) {
    throw new HTTPException(404, { message: "Organization not found" });
  }

  if (data.slug && data.slug !== existing.slug) {
    const slugTaken = await prisma.organization.findUnique({
      where: { slug: data.slug },
    });
    if (slugTaken) {
      throw new HTTPException(409, { message: "Slug already taken" });
    }
  }

  return prisma.organization.update({ where: { id }, data });
}

export async function deleteOrganization(id: string) {
  const existing = await prisma.organization.findUnique({ where: { id } });
  if (!existing) {
    throw new HTTPException(404, { message: "Organization not found" });
  }
  const result = await prisma.$transaction([
    prisma.roleAssignment.deleteMany({
      where: { scopeType: RoleScopeType.ORGANIZATION, scopeId: id },
    }),
    prisma.role.deleteMany({
      where: { scopeType: RoleScopeType.ORGANIZATION, scopeId: id },
    }),
    prisma.organization.delete({ where: { id } }),
  ]);
  return { ...result[2], name: existing.name };
}

export async function listOrganizations(params: {
  limit?: number;
  offset?: number;
}) {
  const { limit = 10, offset = 0 } = params;

  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.organization.count(),
  ]);

  const owners = await getOrgOwners(organizations.map((o) => o.id));

  return {
    organizations: organizations.map((org) => ({
      ...org,
      owner: owners.get(org.id) ?? null,
    })),
    total,
  };
}

export async function listOrganizationsForUser(userId: string) {
  const organizations = await prisma.organization.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: "asc" },
  });

  return { organizations };
}

export async function activateOrganizationForUser(params: {
  sessionId: string;
  userId: string;
  organizationId: string;
}) {
  const membership = await prisma.member.findFirst({
    where: { userId: params.userId, organizationId: params.organizationId },
  });
  if (!membership) {
    throw new HTTPException(403, {
      message: "You are not a member of this organization",
    });
  }

  return prisma.session.update({
    where: { id: params.sessionId },
    data: { activeOrganizationId: params.organizationId },
  });
}
