import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { updateApplication as updateApplicationService } from "#services/application.service";
import { assertAccess } from "#services/role-permission.service";
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "application::update");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const app = await updateApplicationService(id, body);

    logAudit({
      event: "application.updated",
      category: "application",
      c,
    });

    return c.json(app, 200);
  },
});
