import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { updateApplication as updateApplicationService } from "#services/application.service";
import { prepend } from "#utils/list";
import {
  applicationIdParamSchema,
  applicationSchema,
  errorSchema,
  updateApplicationBodySchema,
} from "./schema";

export const updateApplication = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("application::update")),
    method: "put",
    path: "/{id}",
    tags: ["Application"],
    summary: "Update an application",
    description: "Update an application by ID.",
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
      ...unauthorizedResponse,

      ...forbiddenResponse,
      ...okResponseFn(applicationSchema, "The updated application"),
      ...notFoundResponse,
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
