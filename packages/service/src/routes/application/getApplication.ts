import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { requireAdmin } from "#middleware/require-admin";
import {
  applicationIdParamSchema,
  applicationSchema,
  errorSchema,
} from "./schema";

export const getApplication = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Application"],
    summary: "Get an application",
    description: "Returns a single application by ID.",
    middleware: requireAdmin,
    request: {
      params: applicationIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: applicationSchema },
        },
        description: "The application",
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

    const app = await prisma.application.findFirst({
      where: { id, deletedAt: null },
    });
    if (!app) {
      throw new HTTPException(404, { message: "Application not found" });
    }

    return c.json(app, 200);
  },
});
