import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/middleware/require-admin";
import {
  applicationSchema,
  createApplicationBodySchema,
  errorSchema,
} from "./schema";

export const createApplication = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["Application"],
    summary: "Create an application",
    description: "Create a new application.",
    middleware: requireAdmin,
    request: {
      body: {
        content: {
          "application/json": {
            schema: createApplicationBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      201: {
        content: {
          "application/json": { schema: applicationSchema },
        },
        description: "The created application",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
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
    const body = c.req.valid("json");

    const existing = await prisma.application.findFirst({
      where: { code: body.code, deletedAt: null },
    });
    if (existing) {
      throw new HTTPException(409, {
        message: "Application code already exists",
      });
    }

    const app = await prisma.application.create({
      data: {
        name: body.name,
        code: body.code,
        description: body.description,
        logo: body.logo,
        sortOrder: body.sortOrder,
      },
    });

    return c.json(app, 201);
  },
});
