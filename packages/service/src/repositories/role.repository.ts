import { prisma } from "#lib/db";
import { roleWhereByScope } from "#lib/scope";

export const roleRepository = {
  findByScopePrefix(scope: string) {
    return prisma.role.findMany({
      where: roleWhereByScope(scope),
      orderBy: { createdAt: "asc" },
    });
  },

  findById(id: string) {
    return prisma.role.findUnique({ where: { id } });
  },

  findByCode(code: string) {
    return prisma.role.findUnique({ where: { code } });
  },

  create(data: { name: string; code: string; flags?: string[] }) {
    return prisma.role.create({ data });
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
