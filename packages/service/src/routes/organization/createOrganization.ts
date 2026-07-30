import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { createOrganization as createOrganizationService } from "#services/organization.service";
import { assertAccess } from "#services/role-permission.service";
import { createOrganizationBodySchema, organizationSchema } from "./schema";

export const createOrganization = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createOrganization",
    method: "post",
    path: "/",
    tags: ["Organization"],
    summary: "Create an organization",
    description:
      "Create a new organization. Accepts multipart/form-data with optional logo file.",
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: createOrganizationBodySchema,
          },
        },
      },
    },
    responses: {
      ...badRequestResponse,
      ...unauthorizedResponse,
      ...forbiddenResponse,
      409: {
        description: "Slug already taken",
      },
      ...createdResponseFn(organizationSchema, "The created organization"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/organization:create");

    const contentType = c.req.raw.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new HTTPException(400, {
        message: "Expected multipart/form-data",
      });
    }

    const body = c.req.valid("form");
    const name = body.name;
    const slug = body.slug;

    if (!name || !slug) {
      throw new HTTPException(400, { message: "name and slug are required" });
    }

    const logoFile = body.logo instanceof File ? body.logo : undefined;
    const org = await createOrganizationService(
      { name, slug },
      logoFile,
      getPrincipalUserId(principal),
    );

    logAudit({
      event: "organization.created",
      category: "organization",
      c,
    });

    return c.json(org, 201);
  },
});
