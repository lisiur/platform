import { z } from "@hono/zod-openapi";
import { menuSchema } from "#routes/menu/schema";

export const userRoleSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    roleId: z.string(),
    role: z.object({
      id: z.string(),
      appId: z.string(),
      name: z.string(),
      code: z.string(),
    }),
    createdAt: z.date(),
  })
  .openapi("UserRole");

export const assignUserRoleBodySchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
});

export const removeUserRoleParamSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
});

export const listUserRolesQuerySchema = z.object({
  userId: z.string().min(1),
});

export const errorSchema = z
  .object({
    code: z.number().openapi({ example: 400 }),
    message: z.string().openapi({ example: "Bad Request" }),
  })
  .openapi("Error");

export const mineMenusResponseSchema = z
  .object({
    menus: menuSchema.array(),
  })
  .openapi("MineMenusResponse");
