import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
import { updateApplication as updateApplicationService } from "../../services/application.service";
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
    const app = await updateApplicationService(id, body);

    logAudit({
      event: "application.updated",
      category: "application",
      targetId: app.id,
      targetName: app.name,
      c,
    });

    return c.json(app, 200);
  },
});
