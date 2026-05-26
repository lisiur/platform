import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { logOperation } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
import {
  errorSchema,
  menuIdParamSchema,
  menuSchema,
  updateMenuBodySchema,
} from "./schema";

export const updateMenu = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{id}",
    tags: ["Menu"],
    summary: "Update a menu",
    description: "Update a menu by ID.",
    middleware: requireAdmin,
    request: {
      params: menuIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: updateMenuBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: menuSchema },
        },
        description: "The updated menu",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await prisma.menu.findUnique({
      where: { id },
      include: { children: true },
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Menu not found" });
    }

    const effectiveLinkType = body.linkType ?? existing.linkType;

    if (
      effectiveLinkType !== "GROUP" &&
      existing.children.length > 0 &&
      body.linkType !== undefined
    ) {
      throw new HTTPException(400, {
        message:
          "Cannot change linkType of a menu that has children. Remove children first.",
      });
    }

    if (effectiveLinkType === "EXTERNAL" && !body.url && !existing.url) {
      throw new HTTPException(400, {
        message: "URL is required when linkType is EXTERNAL",
      });
    }

    const menu = await prisma.menu.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.code !== undefined && { code: body.code }),
        ...(body.icon !== undefined && { icon: body.icon }),
        ...(body.linkType !== undefined && { linkType: body.linkType }),
        ...(body.url !== undefined && { url: body.url }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      },
    });

    logOperation({
      action: "update",
      module: "menu",
      targetId: menu.id,
      targetName: menu.name,
      c,
    });

    return c.json(menu, 200);
  },
});
