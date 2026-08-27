import { HTTPException } from "hono/http-exception";
import { invalidateAppCache } from "#extractors/current-app";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export async function getApplicationById(id: string) {
  const app = await prisma.application.findFirst({
    where: { id },
  });
  if (!app) {
    throw new HTTPException(404, { message: "Application not found" });
  }
  return app;
}

export async function updateApplication(
  id: string,
  data: {
    name?: string;
    code?: string;
    description?: string | null;
    logo?: string | null;
    favicon?: string | null;
    copyright?: string | null;
    icp?: string | null;
    psif?: string | null;
    watermarkEnabled?: boolean;
    watermarkConfig?: string | null;
    sortOrder?: number;
  },
) {
  const existing = await prisma.application.findFirst({
    where: { id },
  });
  if (!existing) {
    throw new HTTPException(404, { message: "Application not found" });
  }

  if (data.code && data.code !== existing.code) {
    const codeTaken = await prisma.application.findFirst({
      where: { code: data.code },
    });
    if (codeTaken) {
      throw new HTTPException(409, {
        message: "Application code already exists",
      });
    }
  }

  const app = await prisma.application.update({ where: { id }, data });
  invalidateAppCache(app.code);
  // A code change orphans the old cache entry too — drop both codes.
  if (data.code && data.code !== existing.code) {
    invalidateAppCache(existing.code);
  }
  return app;
}

export async function uploadApplicationLogo(
  appId: string,
  file: File,
  uploaderId: string,
) {
  const { createAttachment: createAttachmentSvc, deleteAttachmentsByBiz } =
    await import("#modules/attachment/attachment.service");

  return prisma.$transaction(async (tx) => {
    await deleteAttachmentsByBiz("application:logo", appId, tx);

    const result = await createAttachmentSvc({
      file,
      visibility: "public",
      uploaderId,
      bizType: "application:logo",
      bizId: appId,
      tx,
    });

    const app = await tx.application.update({
      where: { id: appId },
      data: {
        logo: result.url,
        logoId: result.attachmentId,
      },
    });
    invalidateAppCache(app.code);

    return {
      url: result.url,
      attachmentId: result.attachmentId,
      app,
    };
  });
}

export async function uploadApplicationFavicon(
  appId: string,
  file: File,
  uploaderId: string,
) {
  const { createAttachment: createAttachmentSvc, deleteAttachmentsByBiz } =
    await import("#modules/attachment/attachment.service");

  return prisma.$transaction(async (tx) => {
    await deleteAttachmentsByBiz("application:favicon", appId, tx);

    const result = await createAttachmentSvc({
      file,
      visibility: "public",
      uploaderId,
      bizType: "application:favicon",
      bizId: appId,
      tx,
    });

    const app = await tx.application.update({
      where: { id: appId },
      data: {
        favicon: result.url,
        faviconId: result.attachmentId,
      },
    });
    invalidateAppCache(app.code);

    return {
      url: result.url,
      attachmentId: result.attachmentId,
      app,
    };
  });
}

export async function listApplications(params: {
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { search, limit = 10, offset = 0 } = params;
  const where: Prisma.ApplicationWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const [applications, total] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.application.count({ where }),
  ]);

  return { applications, total };
}
