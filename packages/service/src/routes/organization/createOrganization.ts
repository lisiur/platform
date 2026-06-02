import { logAudit } from "#lib/logger";
import { createOrganization as createOrganizationService } from "#services/organization.service";
import { definePermissionRoute } from "../shared/admin-route";
import {
  createOrganizationBodySchema,
  errorSchema,
  organizationSchema,
} from "./schema";

export const createOrganization = definePermissionRoute({
  permission: "organization::create",
  route: {
    method: "post",
    path: "/",
    tags: ["Organization"],
    summary: "Create an organization",
    description: "Create a new organization.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: createOrganizationBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      201: {
        content: {
          "application/json": { schema: organizationSchema },
        },
        description: "The created organization",
      },
      409: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Slug already taken",
      },
    },
  },
  handler: async (c) => {
    const body = c.req.valid("json");
    const org = await createOrganizationService(body);

    logAudit({
      event: "organization.created",
      category: "organization",
      targetId: org.id,
      targetName: org.name,
      c,
    });

    return c.json(org, 201);
  },
});
