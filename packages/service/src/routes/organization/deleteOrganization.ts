import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { deleteOrganization as deleteOrganizationService } from "#services/organization.service";
import { assertAccess } from "#services/role-permission.service";
import { deleteSuccessSchema, organizationIdParamSchema } from "./schema";

export const deleteOrganization = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Organization"],
    summary: "Delete an organization",
    description:
      "Delete an organization by ID. Cascades to members and invitations.",
    request: {
      params: organizationIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Successfully deleted"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "organization::delete");
    const { id } = c.req.valid("param");
    await deleteOrganizationService(id);

    logAudit({
      event: "organization.deleted",
      category: "organization",
      c,
    });

    return c.json({ success: true as const }, 200);
  },
});
