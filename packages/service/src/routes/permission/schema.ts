import { z } from "@hono/zod-openapi";

export const permissionSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    appId: z.string().nullable().openapi({ example: null }),
    name: z.string().openapi({ example: "List Users" }),
    code: z.string().openapi({ example: "user::list" }),
    group: z.string().openapi({ example: "user" }),
    description: z.string().nullable().openapi({ example: "List all users" }),
  })
  .openapi("Permission");

export const listPermissionsQuerySchema = z.object({
  appId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const listPermissionsResponseSchema = z
  .object({ permissions: permissionSchema.array() })
  .openapi("ListPermissionsResponse");
