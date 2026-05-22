import { z } from "@hono/zod-openapi";
import { menuSchema } from "#routes/menu/schema";

export const batchAssignBodySchema = z.object({
  roleId: z.string().min(1).openapi({ example: "admin" }),
  menuIds: z.string().array(),
});

export const roleIdParamSchema = z.object({
  roleId: z.string().min(1).openapi({ example: "admin" }),
});

export const roleMenusResponseSchema = z
  .object({
    menus: menuSchema.array(),
  })
  .openapi("RoleMenusResponse");

export const mineMenusResponseSchema = z
  .object({
    menus: menuSchema.array(),
  })
  .openapi("MineMenusResponse");

export const errorSchema = z
  .object({
    code: z.number().openapi({ example: 400 }),
    message: z.string().openapi({ example: "Bad Request" }),
  })
  .openapi("Error");

export type BatchAssignBody = z.infer<typeof batchAssignBodySchema>;
