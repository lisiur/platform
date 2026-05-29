import { HTTPException } from "hono/http-exception";
import { menuRoleRepository } from "#repositories/menu-role.repository";
import { roleRepository } from "#repositories/role.repository";
import { userRoleRepository } from "#repositories/user-role.repository";

function collectDescendantIds(
  parentId: string,
  allMenus: { id: string; parentId: string | null }[],
): string[] {
  const ids = [parentId];
  const children = allMenus.filter((m) => m.parentId === parentId);
  for (const child of children) {
    ids.push(...collectDescendantIds(child.id, allMenus));
  }
  return ids;
}

function collectAncestorGroupIds(
  menuId: string,
  allMenus: { id: string; parentId: string | null; linkType: string }[],
): string[] {
  const ids: string[] = [];
  let current = allMenus.find((menu) => menu.id === menuId);

  while (current?.parentId) {
    const parent = allMenus.find((menu) => menu.id === current?.parentId);
    if (!parent) break;

    if (parent.linkType === "GROUP") {
      ids.push(parent.id);
    }

    current = parent;
  }

  return ids;
}

export async function getMenusForRole(roleId: string) {
  return menuRoleRepository.getMenusForRole(roleId);
}

export async function getMenusForUser(userId: string) {
  return userRoleRepository.getMenusForUser(userId);
}

export async function batchAssignMenus(roleId: string, menuIds: string[]) {
  const role = await roleRepository.findById(roleId);
  if (!role) {
    throw new HTTPException(404, { message: "Role not found" });
  }

  const allMenus = await menuRoleRepository.findMenusByAppId(role.appId);
  const validMenuIds = new Set(allMenus.map((menu) => menu.id));

  const assignedMenuIds = new Set<string>();
  for (const menuId of menuIds) {
    if (!validMenuIds.has(menuId)) {
      throw new HTTPException(400, {
        message: "Menu does not belong to the role application",
      });
    }

    for (const id of collectAncestorGroupIds(menuId, allMenus)) {
      assignedMenuIds.add(id);
    }

    for (const id of collectDescendantIds(menuId, allMenus)) {
      assignedMenuIds.add(id);
    }
  }

  await menuRoleRepository.batchAssign(roleId, Array.from(assignedMenuIds));

  return menuRoleRepository.getMenusForRole(roleId);
}
