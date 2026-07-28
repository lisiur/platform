import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { getOrgOwners, provisionOrgRoles } from "#lib/org-role";
import {
  orgScope,
  roleAssignmentWhereByRoleScope,
  roleWhereByScope,
} from "#lib/scope";

export async function getOrganizationById(id: string) {
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) {
    throw new HTTPException(404, { message: "Organization not found" });
  }
  return org;
}

export async function createOrganization(
  data: {
    name: string;
    slug: string;
  },
  logoFile?: File,
  uploaderId?: string,
) {
  const { createAttachment: createAttachmentSvc, deleteAttachmentsByBiz } =
    await import("#services/attachment.service");

  const existing = await prisma.organization.findUnique({
    where: { slug: data.slug },
  });
  if (existing) {
    throw new HTTPException(409, { message: "Slug already taken" });
  }

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
        createdAt: new Date(),
      },
    });

    if (logoFile) {
      if (!uploaderId) {
        throw new HTTPException(400, {
          message: "uploaderId is required when logoFile is provided",
        });
      }
      await deleteAttachmentsByBiz("organization:logo", org.id, tx);

      const result = await createAttachmentSvc({
        file: logoFile,
        visibility: "public",
        uploaderId,
        bizType: "organization:logo",
        bizId: org.id,
        tx,
      });

      const updatedOrg = await tx.organization.update({
        where: { id: org.id },
        data: {
          logo: result.url,
          logoId: result.attachmentId,
        },
      });

      return updatedOrg;
    }

    return org;
  });
}

export async function registerOrganizationForUser(
  userId: string,
  data: {
    name: string;
    slug: string;
  },
  logoFile?: File,
) {
  const { createAttachment: createAttachmentSvc, deleteAttachmentsByBiz } =
    await import("#services/attachment.service");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.organization.findUnique({
      where: { slug: data.slug },
    });
    if (existing) {
      throw new HTTPException(409, { message: "Slug already taken" });
    }

    const organization = await tx.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
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

    const { ownerRoleId } = await provisionOrgRoles(tx, organization.id);
    await tx.roleAssignment.upsert({
      where: {
        userId_roleId: { userId, roleId: ownerRoleId },
      },
      update: {},
      create: { userId, roleId: ownerRoleId },
    });

    if (logoFile) {
      await deleteAttachmentsByBiz("organization:logo", organization.id, tx);

      const result = await createAttachmentSvc({
        file: logoFile,
        visibility: "public",
        uploaderId: userId,
        bizType: "organization:logo",
        bizId: organization.id,
        tx,
      });

      const updatedOrg = await tx.organization.update({
        where: { id: organization.id },
        data: {
          logo: result.url,
          logoId: result.attachmentId,
        },
      });

      return updatedOrg;
    }

    return organization;
  });
}

export async function updateOrganization(
  id: string,
  data: {
    name?: string;
    slug?: string;
  },
  logoFile?: File,
  uploaderId?: string,
) {
  const { createAttachment: createAttachmentSvc, deleteAttachmentsByBiz } =
    await import("#services/attachment.service");

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

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        slug: data.slug ?? existing.slug,
      },
    });

    if (logoFile) {
      if (!uploaderId) {
        throw new HTTPException(400, {
          message: "uploaderId is required when logoFile is provided",
        });
      }
      await deleteAttachmentsByBiz("organization:logo", org.id, tx);

      const result = await createAttachmentSvc({
        file: logoFile,
        visibility: "public",
        uploaderId,
        bizType: "organization:logo",
        bizId: org.id,
        tx,
      });

      const updatedOrg = await tx.organization.update({
        where: { id: org.id },
        data: {
          logo: result.url,
          logoId: result.attachmentId,
        },
      });

      return updatedOrg;
    }

    return org;
  });
}

export async function uploadOrganizationLogo(
  orgId: string,
  file: File,
  uploaderId: string,
) {
  const { createAttachment: createAttachmentSvc, deleteAttachmentsByBiz } =
    await import("#services/attachment.service");

  return prisma.$transaction(async (tx) => {
    await deleteAttachmentsByBiz("organization:logo", orgId, tx);

    const result = await createAttachmentSvc({
      file,
      visibility: "public",
      uploaderId,
      bizType: "organization:logo",
      bizId: orgId,
      tx,
    });

    const org = await tx.organization.update({
      where: { id: orgId },
      data: {
        logo: result.url,
        logoId: result.attachmentId,
      },
    });

    return {
      url: result.url,
      attachmentId: result.attachmentId,
      org,
    };
  });
}

export async function deleteOrganization(id: string) {
  const existing = await prisma.organization.findUnique({ where: { id } });
  if (!existing) {
    throw new HTTPException(404, { message: "Organization not found" });
  }
  const result = await prisma.$transaction([
    prisma.roleAssignment.deleteMany({
      where: roleAssignmentWhereByRoleScope(orgScope(id)),
    }),
    prisma.role.deleteMany({
      where: roleWhereByScope(orgScope(id)),
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
