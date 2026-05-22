import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/middleware/require-admin";
import {
  applicationIdParamSchema,
  applicationSchema,
  errorSchema,
  updateApplicationBodySchema,
} from "./schema";

export const updateApplication = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{id}",
    tags: ["Application"],
    summary: "Update an application",
    description: "Update an application by ID.",
    middleware: requireAdmin,
    request: {
      params: applicationIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: updateApplicationBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: applicationSchema },
        },
        description: "The updated application",
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
      409: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Application code already exists",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await prisma.application.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new HTTPException(404, { message: "Application not found" });
    }

    if (body.code && body.code !== existing.code) {
      const codeTaken = await prisma.application.findFirst({
        where: { code: body.code, deletedAt: null },
      });
      if (codeTaken) {
        throw new HTTPException(409, {
          message: "Application code already exists",
        });
      }
    }

    const app = await prisma.application.update({
      where: { id },
      data: body,
    });

    return c.json(app, 200);
  },
});
