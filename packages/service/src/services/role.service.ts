import { isBuiltinRole } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { scopeOfRoleCode } from "#lib/scope";
import { roleRepository } from "#repositories/role.repository";

export async function getRoleById(id: string) {
  const role = await roleRepository.findById(id);
  if (!role) {
    throw new HTTPException(404, { message: "Role not found" });
  }
  return role;
}

export async function createRole(data: {
  name: string;
  code: string;
  flags?: string[];
}) {
  const existing = await roleRepository.findByCode(data.code);
  if (existing) {
    throw new HTTPException(409, {
      message: "Role code already exists",
    });
  }
  return roleRepository.create({
    name: data.name,
    code: data.code,
    flags: data.flags,
  });
}

export async function updateRole(
  id: string,
  data: {
    name?: string;
    code?: string;
    flags?: string[];
  },
) {
  const role = await roleRepository.findById(id);
  if (!role) {
    throw new HTTPException(404, { message: "Role not found" });
  }
  if (
    isBuiltinRole(role.flags) &&
    (data.code !== undefined || data.flags !== undefined)
  ) {
    throw new HTTPException(400, {
      message: "Cannot change the code or flags of a built-in role",
    });
  }
  if (data.code && data.code !== role.code) {
    if (scopeOfRoleCode(data.code) !== scopeOfRoleCode(role.code)) {
      throw new HTTPException(400, {
        message: "Cannot change the scope of an existing role",
      });
    }
    const codeTaken = await roleRepository.findByCode(data.code);
    if (codeTaken) {
      throw new HTTPException(409, {
        message: "Role code already exists",
      });
    }
  }
  return roleRepository.update(id, data);
}

export async function deleteRole(id: string) {
  const role = await roleRepository.findById(id);
  if (!role) {
    throw new HTTPException(404, { message: "Role not found" });
  }
  if (isBuiltinRole(role.flags)) {
    throw new HTTPException(400, { message: "Cannot delete a built-in role" });
  }
  await prisma.$transaction([
    prisma.roleAssignment.deleteMany({ where: { roleId: id } }),
    prisma.role.delete({ where: { id } }),
  ]);
  return { name: role.name };
}

export async function listRoles(
  scopePrefix: string,
  limit?: number,
  offset?: number,
) {
  const [roles, total] = await Promise.all([
    roleRepository.findByScopePrefix(scopePrefix, limit, offset),
    roleRepository.countByScopePrefix(scopePrefix),
  ]);
  return { roles, total };
}
