import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import type { RoleScopeType } from "#lib/role-scope";
import { roleRepository } from "#repositories/role.repository";

export async function getRoleById(id: string) {
  const role = await roleRepository.findById(id);
  if (!role) {
    throw new HTTPException(404, { message: "Role not found" });
  }
  return role;
}

export async function createRole(data: {
  appId: string;
  scopeType?: RoleScopeType;
  scopeId?: string | null;
  name: string;
  code: string;
  flags?: string[];
}) {
  const existing = await roleRepository.findByAppAndCode(
    data.appId,
    data.code,
    {
      scopeId: data.scopeId,
      scopeType: data.scopeType,
    },
  );
  if (existing) {
    throw new HTTPException(409, {
      message: "Role code already exists in this scope",
    });
  }
  return roleRepository.create(data);
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
  if (data.code && data.code !== role.code) {
    const codeTaken = await roleRepository.findByAppAndCode(
      role.appId,
      data.code,
      { scopeId: role.scopeId, scopeType: role.scopeType },
    );
    if (codeTaken) {
      throw new HTTPException(409, {
        message: "Role code already exists in this scope",
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
  await prisma.$transaction([
    prisma.roleAssignment.deleteMany({ where: { roleId: id } }),
    prisma.role.delete({ where: { id } }),
  ]);
  return { name: role.name };
}

export async function listRoles(
  appId: string,
  scope?: { scopeType?: RoleScopeType; scopeId?: string | null },
) {
  return roleRepository.findByAppId(appId, scope);
}
