import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { menuRoleRepository } from "#repositories/menu-role.repository";
import {
  batchAssignBodySchema,
  errorSchema,
  roleMenusResponseSchema,
} from "./schema";

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

export const batchAssignMenus = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/batch",
    tags: ["MenuRole"],
    summary: "Batch assign menus to role",
    description:
      "Replaces all menu assignments for a role. Automatically includes descendant menus.",
    middleware: requireAdmin,
    request: {
      body: {
        content: { "application/json": { schema: batchAssignBodySchema } },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: roleMenusResponseSchema },
        },
        description: "Updated menu assignments for the role",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const { roleId, menuIds } = c.req.valid("json");

    const allMenus = await menuRoleRepository.findAllMenus();

    const allDescendantIds = new Set<string>();
    for (const menuId of menuIds) {
      const ids = collectDescendantIds(menuId, allMenus);
      for (const id of ids) {
        allDescendantIds.add(id);
      }
    }

    await menuRoleRepository.batchAssign(roleId, Array.from(allDescendantIds));

    const menus = await menuRoleRepository.getMenusForRole(roleId);
    return c.json({ menus }, 200);
  },
});
