import { z } from "@hono/zod-openapi";

export const linkTypeSchema = z.enum(["GROUP", "INTERNAL", "EXTERNAL"]);

export const menuSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    appId: z.string().openapi({ example: "clx1234567890" }),
    parentId: z.string().nullable().optional(),
    name: z.string().openapi({ example: "Dashboard" }),
    code: z.string().openapi({ example: "dashboard" }),
    icon: z.string().nullable().optional(),
    linkType: linkTypeSchema.openapi({ example: "INTERNAL" }),
    url: z.string().nullable().optional(),
    sortOrder: z.number().openapi({ example: 0 }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("Menu");

export const listMenusQuerySchema = z.object({
  appId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const menuIdParamSchema = z.object({
  id: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const createMenuBodySchema = z
  .object({
    name: z.string().min(1).openapi({ example: "Dashboard" }),
    code: z.string().min(1).openapi({ example: "dashboard" }),
    appId: z.string().min(1).openapi({ example: "clx1234567890" }),
    parentId: z.string().optional(),
    icon: z.string().optional(),
    linkType: linkTypeSchema.default("GROUP"),
    url: z.string().optional(),
  })
  .refine(
    (data) => !(data.linkType === "EXTERNAL" && !data.url),
    "URL is required when linkType is EXTERNAL",
  );

export const updateMenuBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    icon: z.string().nullable().optional(),
    linkType: linkTypeSchema.optional(),
    url: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine(
    (data) =>
      !(
        data.linkType === "EXTERNAL" &&
        (data.url === null || data.url === undefined)
      ),
    "URL is required when linkType is EXTERNAL",
  );

export const errorSchema = z
  .object({
    code: z.number().openapi({ example: 400 }),
    message: z.string().openapi({ example: "Bad Request" }),
  })
  .openapi("Error");

export const deleteSuccessSchema = z
  .object({
    success: z.literal(true),
  })
  .openapi("DeleteSuccess");

export const listMenusResponseSchema = z
  .object({
    menus: menuSchema.array(),
  })
  .openapi("ListMenusResponse");

export type Menu = z.infer<typeof menuSchema>;
export type CreateMenuBody = z.infer<typeof createMenuBodySchema>;
export type UpdateMenuBody = z.infer<typeof updateMenuBodySchema>;
