import { prisma } from "#lib/db";

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

export async function listPermissionsForApp(appId: string) {
  const permissions = await prisma.permission.findMany({
    where: { OR: [{ appId }, { appId: null }] },
    orderBy: [{ group: "asc" }, { code: "asc" }],
  });
  return { permissions };
}

export async function deletePermissionByCode(
  code: string,
  appId?: string | null,
) {
  const permission = await findPermissionByCode(code, appId);
  if (!permission) return null;
  return prisma.permission.delete({ where: { id: permission.id } });
}
