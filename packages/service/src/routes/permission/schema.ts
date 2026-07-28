import { z } from "@hono/zod-openapi";

export const permissionSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "List Users" }),
    code: z.string().openapi({ example: "system/user:list" }),
    group: z.string().openapi({ example: "user" }),
    description: z.string().nullable().openapi({ example: "List all users" }),
  })
  .openapi("Permission");

export const permissionSortFieldSchema = z.enum(["name", "description"]);

export const listPermissionsQuerySchema = z.object({
  search: z.string().optional().openapi({ example: "user" }),
  sort: permissionSortFieldSchema.optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().min(1).max(100).default(10),
  offset: z.coerce.number().min(0).default(0),
});

export const listPermissionsResponseSchema = z
  .object({ permissions: permissionSchema.array(), total: z.number() })
  .openapi("ListPermissionsResponse");

export type PermissionSortField = z.infer<typeof permissionSortFieldSchema>;
