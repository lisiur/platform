import { prisma } from "#lib/db";
import {
  PLATFORM_SCOPE_ID,
  RoleScopeType,
  scopeIdOrDefault,
} from "#lib/role-scope";

export const roleRepository = {
  findByAppId(
    appId: string,
    scope?: { scopeType?: RoleScopeType; scopeId?: string | null },
  ) {
    const scopedWhere = scope?.scopeType
      ? {
          OR: [
            { scopeType: RoleScopeType.PLATFORM, scopeId: PLATFORM_SCOPE_ID },
            {
              scopeType: scope.scopeType,
              scopeId: scopeIdOrDefault(scope.scopeId),
            },
          ],
        }
      : { scopeType: RoleScopeType.PLATFORM, scopeId: PLATFORM_SCOPE_ID };

    return prisma.role.findMany({
      where: { appId, ...scopedWhere },
      orderBy: { createdAt: "asc" },
    });
  },

  findById(id: string) {
    return prisma.role.findUnique({ where: { id } });
  },

  findByAppAndCode(
    appId: string,
    code: string,
    scope?: { scopeType?: RoleScopeType; scopeId?: string | null },
  ) {
    const scopeType = scope?.scopeType ?? RoleScopeType.PLATFORM;
    const scopeId = scopeIdOrDefault(scope?.scopeId);
    return prisma.role.findUnique({
      where: {
        appId_scopeType_scopeId_code: { appId, scopeType, scopeId, code },
      },
    });
  },

  create(data: {
    appId: string;
    scopeType?: RoleScopeType;
    scopeId?: string | null;
    name: string;
    code: string;
    flags?: string[];
  }) {
    return prisma.role.create({
      data: {
        ...data,
        scopeType: data.scopeType ?? RoleScopeType.PLATFORM,
        scopeId: scopeIdOrDefault(data.scopeId),
      },
    });
  },

  update(
    id: string,
    data: {
      name?: string;
      code?: string;
      flags?: string[];
    },
  ) {
    return prisma.role.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.role.delete({ where: { id } });
  },
};
