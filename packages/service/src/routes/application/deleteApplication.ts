import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { requireAdmin } from "#middleware/require-admin";
import {
  applicationIdParamSchema,
  deleteSuccessSchema,
  errorSchema,
} from "./schema";

export const deleteApplication = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Application"],
    summary: "Delete an application",
    description: "Soft-delete an application by ID.",
    middleware: requireAdmin,
    request: {
      params: applicationIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: deleteSuccessSchema },
        },
        description: "Successfully deleted",
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

    const existing = await prisma.application.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Application not found" });
    }

    await prisma.application.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return c.json({ success: true as const }, 200);
  },
});
