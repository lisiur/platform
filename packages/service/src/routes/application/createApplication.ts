import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import {
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { createApplication as createApplicationService } from "#services/application.service";
import { prepend } from "#utils/list";
import {
  applicationSchema,
  createApplicationBodySchema,
  errorSchema,
} from "./schema";

export const createApplication = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("application::create")),
    method: "post",
    path: "/",
    tags: ["Application"],
    summary: "Create an application",
    description: "Create a new application.",
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
      ...unauthorizedResponse,

      ...forbiddenResponse,
      ...createdResponseFn(applicationSchema, "The created application"),
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
