import { z } from "@hono/zod-openapi";
import { permissionSchema } from "../permission/schema";

export const roleIdParamSchema = z.object({
  roleId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const rolePermissionsResponseSchema = z
  .object({ permissions: permissionSchema.array() })
  .openapi("RolePermissionsResponse");

export const batchAssignRolePermissionsBodySchema = z
  .object({
    roleId: z.string().min(1).openapi({ example: "clx1234567890" }),
    permissionIds: z.array(z.string()).openapi({
      description: "Replaces all permissions assigned to the role",
    }),
  })
  .openapi("BatchAssignRolePermissionsBody");
