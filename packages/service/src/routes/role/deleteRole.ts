import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/middleware/require-admin";
import { roleRepository } from "@/repositories/role.repository";
import { errorSchema, roleIdParamSchema, successSchema } from "./schema";

export const deleteRole = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Role"],
    summary: "Delete a role",
    middleware: requireAdmin,
    request: {
      params: roleIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: successSchema },
        },
        description: "Deleted",
      },
      404: {
        content: { "application/json": { schema: errorSchema } },
        description: "Not Found",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const role = await roleRepository.findById(id);
    if (!role) {
      return c.json({ code: 404, message: "Role not found" }, 404);
    }
    await prisma.$transaction([
      prisma.menuRole.deleteMany({ where: { roleId: id } }),
      prisma.userRole.deleteMany({ where: { roleId: id } }),
      prisma.role.delete({ where: { id } }),
    ]);
    return c.json({ success: true }, 200);
  },
});
