import { logAudit } from "#lib/logger";
import { updateApplication as updateApplicationService } from "#services/application.service";
import { definePermissionRoute } from "../shared/admin-route";
import {
  applicationIdParamSchema,
  applicationSchema,
  errorSchema,
  updateApplicationBodySchema,
} from "./schema";

export const updateApplication = definePermissionRoute({
  permission: "application::update",
  route: {
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
      200: {
        content: {
          "application/json": { schema: applicationSchema },
        },
        description: "The updated application",
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
  },
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
