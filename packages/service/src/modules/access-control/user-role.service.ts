import { assertUserIsNotBuiltin } from "#lib/protected-user";
import { userRoleRepository } from "#modules/access-control/user-role.repository";

export async function assignUserRole(userId: string, roleId: string) {
  await assertUserIsNotBuiltin(userId);
  return userRoleRepository.assign(userId, roleId);
}

export async function removeUserRole(userId: string, roleId: string) {
  await assertUserIsNotBuiltin(userId);
  await userRoleRepository.remove(userId, roleId);
}

export async function listUserRoles(userId: string) {
  return userRoleRepository.findByUser(userId);
}
