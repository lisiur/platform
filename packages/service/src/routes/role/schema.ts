import { z } from "@hono/zod-openapi";

export { errorSchema, successSchema } from "../shared/schema";

export const roleSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    appId: z.string().openapi({ example: "app-admin" }),
    name: z.string().openapi({ example: "Administrator" }),
    code: z.string().openapi({ example: "admin" }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("Role");

export const listRolesQuerySchema = z.object({
  appId: z.string().min(1),
});

export const createRoleBodySchema = z.object({
  appId: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1),
});

export const updateRoleBodySchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
});

export const roleIdParamSchema = z.object({
  id: z.string().min(1),
});
