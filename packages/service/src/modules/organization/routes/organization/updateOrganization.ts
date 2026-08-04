import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { updateOrganization as updateOrganizationService } from "#modules/organization/organization.service";
import {
  errorSchema,
  organizationIdParamSchema,
  organizationSchema,
  updateOrganizationBodySchema,
} from "./schema";

export const updateOrganization = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateOrganization",
    method: "put",
    path: "/{id}",
    tags: ["Organization"],
    summary: "Update an organization",
    description:
      "Update an organization by ID. Accepts multipart/form-data with optional logo file.",
    request: {
      params: organizationIdParamSchema,
      body: {
        content: {
          "multipart/form-data": {
            schema: updateOrganizationBodySchema,
          },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,

      ...forbiddenResponse,
      ...notFoundResponse,
      409: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Slug already taken",
      },
      ...okResponseFn(organizationSchema, "The updated organization"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/organization:update");
    const { id } = c.req.valid("param");

    const contentType = c.req.raw.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new HTTPException(400, {
        message: "Expected multipart/form-data",
      });
    }

    const body = c.req.valid("form");
    const name = body.name;
    const slug = body.slug;
    const logoFile = body.logo instanceof File ? body.logo : undefined;

    const org = await updateOrganizationService(
      id,
      { name, slug },
      logoFile,
      getPrincipalUserId(principal),
    );

    logAudit({
      event: "organization.updated",
      category: "organization",
      c,
    });

    return c.json(org, 200);
  },
});
