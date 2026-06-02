import { prisma } from "#lib/db";

export function createPermission(data: {
  appId: string;
  name: string;
  code: string;
  group: string;
  description?: string;
}) {
  return prisma.permission.create({ data });
}

export function findPermissionByCode(appId: string, code: string) {
  return prisma.permission.findUnique({
    where: { appId_code: { appId, code } },
  });
}

export function findPermissionsByGroup(appId: string, group: string) {
  return prisma.permission.findMany({
    where: { appId, group },
  });
}

export function findPermissionsByApp(appId: string) {
  return prisma.permission.findMany({
    where: { appId },
  });
}

export function deletePermissionByCode(appId: string, code: string) {
  return prisma.permission.delete({
    where: { appId_code: { appId, code } },
  });
}
