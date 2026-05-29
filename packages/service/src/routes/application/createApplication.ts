import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
import { createApplication as createApplicationService } from "#services/application.service";
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
    const app = await createApplicationService(body);

    logAudit({
      event: "application.created",
      category: "application",
      targetId: app.id,
      targetName: app.name,
      c,
    });

    return c.json(app, 201);
  },
});
