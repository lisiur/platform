import { ORG_OWNER_ROLE_CODE, ORGANIZATION_APP_CODE } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

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
        members: {
          create: {
            userId,
            role: "owner",
            createdAt: new Date(),
          },
        },
      },
    });

    const ownerRole = await tx.role.findUnique({
      where: {
        appId_scopeType_scopeId_code: {
          appId: ORGANIZATION_APP_CODE,
          scopeType: "PLATFORM",
          scopeId: "",
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
            scopeType: "ORGANIZATION",
            scopeId: organization.id,
          },
        },
        update: {},
        create: {
          userId,
          roleId: ownerRole.id,
          scopeType: "ORGANIZATION",
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
  const deleted = await prisma.organization.delete({ where: { id } });
  return { ...deleted, name: existing.name };
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

  return { organizations, total };
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
