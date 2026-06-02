import { logAudit } from "#lib/logger";
import { createApplication as createApplicationService } from "#services/application.service";
import { definePermissionRoute } from "../shared/admin-route";
import {
  applicationSchema,
  createApplicationBodySchema,
  errorSchema,
} from "./schema";

export const createApplication = definePermissionRoute({
  permission: "application::create",
  route: {
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
      201: {
        content: {
          "application/json": { schema: applicationSchema },
        },
        description: "The created application",
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
