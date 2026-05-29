import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
import { createOrganization as createOrganizationService } from "#services/organization.service";
import {
  createOrganizationBodySchema,
  errorSchema,
  organizationSchema,
} from "./schema";

export const createOrganization = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["Organization"],
    summary: "Create an organization",
    description: "Create a new organization.",
    middleware: requireAdmin,
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
        description: "Slug already taken",
      },
    },
  }),
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
