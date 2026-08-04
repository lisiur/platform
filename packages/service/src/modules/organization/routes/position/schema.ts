import { z } from "@hono/zod-openapi";
import { idParamSchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const positionSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    organizationId: z.string(),
    name: z.string().openapi({ example: "Software Engineer" }),
    code: z.string().openapi({ example: "software-engineer" }),
    description: z.string().nullable().optional(),
    sortOrder: z.number().openapi({ example: 0 }),
    membersCount: z.number().openapi({ example: 5 }),
    permissionsCount: z.number().openapi({ example: 3 }),
    createdAt: z.date(),
  })
  .openapi("Position");

export const positionIdParamSchema = idParamSchema();

export const orgIdParamSchema = z.object({
  orgId: z.string(),
});

export const createPositionBodySchema = z.object({
  name: z.string().min(1).openapi({ example: "Software Engineer" }),
  code: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .openapi({ example: "software-engineer" }),
  description: z.string().optional(),
  sortOrder: z.number().optional(),
});

export const updatePositionBodySchema = z.object({
  name: z.string().min(1).optional(),
  code: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
});

export const listPositionsResponseSchema = z
  .object({
    positions: positionSchema.array(),
  })
  .openapi("ListPositionsResponse");

export type Position = z.infer<typeof positionSchema>;
export type CreatePositionBody = z.infer<typeof createPositionBodySchema>;
export type UpdatePositionBody = z.infer<typeof updatePositionBodySchema>;

export const permissionItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  group: z.string(),
  description: z.string().nullable(),
});

export const positionAssignedPermissionsResponseSchema = z
  .object({ assigned: permissionItemSchema.array() })
  .openapi("PositionAssignedPermissionsResponse");

export const positionAvailablePermissionsQuerySchema = z.object({
  search: z.string().optional().openapi({ example: "member" }),
  sort: z.enum(["name", "description"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().min(1).max(100).default(10),
  offset: z.coerce.number().min(0).default(0),
});

export const positionAvailablePermissionsResponseSchema = z
  .object({
    permissions: permissionItemSchema.array(),
    total: z.number(),
  })
  .openapi("PositionAvailablePermissionsResponse");

export const setPositionPermissionsBodySchema = z.object({
  permissionIds: z.array(z.string()),
});
