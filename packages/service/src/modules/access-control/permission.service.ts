import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { permissionWhereByScope } from "#lib/scope";

export type PermissionSortField = "name" | "description";

export function createPermission(data: {
  name: string;
  code: string;
  group: string;
  description?: string;
}) {
  return prisma.permission.create({ data });
}

export function findPermissionByCode(code: string) {
  return prisma.permission.findUnique({
    where: { code },
  });
}

export function findPermissionsByGroup(group: string) {
  return prisma.permission.findMany({
    where: { group },
  });
}

export interface ListPermissionsParams {
  search?: string;
  sort?: PermissionSortField;
  sortDir?: "asc" | "desc";
  limit: number;
  offset: number;
  /** Filters to permissions whose code starts with this prefix (e.g. "system" or "org"). */
  scopePrefix?: string;
}

export async function listPermissions(params: ListPermissionsParams) {
  const { search, sort, sortDir, limit, offset, scopePrefix } = params;

  const where: Prisma.PermissionWhereInput = {
    ...(scopePrefix ? permissionWhereByScope(scopePrefix) : {}),
  };
  if (search) {
    where.AND = [
      {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { group: { contains: search, mode: "insensitive" } },
        ],
      },
    ];
  }

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

export async function deletePermissionByCode(code: string) {
  const permission = await findPermissionByCode(code);
  if (!permission) return null;
  return prisma.permission.delete({ where: { id: permission.id } });
}
