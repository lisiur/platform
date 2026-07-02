import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

export type PermissionSortField = "name" | "description";

export function createPermission(data: {
  appId?: string | null;
  name: string;
  code: string;
  group: string;
  description?: string;
}) {
  return prisma.permission.create({ data });
}

export function findPermissionByCode(code: string, appId?: string | null) {
  return prisma.permission.findFirst({
    where: { appId: appId ?? null, code },
  });
}

export function findPermissionsByGroup(group: string, appId?: string | null) {
  return prisma.permission.findMany({
    where: { appId: appId ?? null, group },
  });
}

export function findPermissionsByApp(appId: string) {
  return prisma.permission.findMany({
    where: { appId },
  });
}

export interface ListPermissionsParams {
  search?: string;
  sort?: PermissionSortField;
  sortDir?: "asc" | "desc";
  limit: number;
  offset: number;
}

export async function listPermissionsForApp(
  appId: string,
  params: ListPermissionsParams,
) {
  const { search, sort, sortDir, limit, offset } = params;

  const appScope = { OR: [{ appId }, { appId: null }] };
  const where: Prisma.PermissionWhereInput = search
    ? {
        AND: [
          appScope,
          {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { code: { contains: search, mode: "insensitive" } },
              { group: { contains: search, mode: "insensitive" } },
            ],
          },
        ],
      }
    : appScope;

  const orderBy: Prisma.PermissionOrderByWithRelationInput[] = sort
    ? [{ [sort]: sortDir === "desc" ? "desc" : "asc" }]
    : [{ group: "asc" }, { code: "asc" }];

  const [permissions, total] = await Promise.all([
    prisma.permission.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
    }),
    prisma.permission.count({ where }),
  ]);

  return { permissions, total };
}

export async function deletePermissionByCode(
  code: string,
  appId?: string | null,
) {
  const permission = await findPermissionByCode(code, appId);
  if (!permission) return null;
  return prisma.permission.delete({ where: { id: permission.id } });
}
