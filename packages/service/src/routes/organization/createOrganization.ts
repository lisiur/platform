import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { createOrganization as createOrganizationService } from "#services/organization.service";
import { assertAccess } from "#services/role-permission.service";
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
      ...unauthorizedResponse,
      ...forbiddenResponse,
      409: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Slug already taken",
      },
      ...createdResponseFn(organizationSchema, "The created organization"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "organization::create");
    const body = c.req.valid("json");
    const org = await createOrganizationService(body);

    logAudit({
      event: "organization.created",
      category: "organization",
      c,
    });

    return c.json(org, 201);
  },
});
