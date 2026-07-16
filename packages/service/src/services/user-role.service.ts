import { assertUserIsNotBuiltin } from "#lib/protected-user";
import type { RoleScopeType } from "#lib/role-scope";
import { userRoleRepository } from "#repositories/user-role.repository";

export async function assignUserRole(
  userId: string,
  roleId: string,
  scope?: { scopeType?: RoleScopeType; scopeId?: string | null },
) {
  await assertUserIsNotBuiltin(userId);
  return userRoleRepository.assign(userId, roleId, scope);
}

export async function removeUserRole(
  userId: string,
  roleId: string,
  scope?: { scopeType?: RoleScopeType; scopeId?: string | null },
) {
  await assertUserIsNotBuiltin(userId);
  await userRoleRepository.remove(userId, roleId, scope);
}

export async function listUserRoles(
  userId: string,
  scope?: { scopeType?: RoleScopeType; scopeId?: string | null },
) {
  return userRoleRepository.findByUser(userId, scope);
}

export async function getUserAppMenus(userId: string) {
  return userRoleRepository.getMenusForUser(userId);
}
