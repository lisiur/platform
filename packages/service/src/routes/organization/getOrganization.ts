import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { getOrganizationById } from "#services/organization.service";
import { prepend } from "#utils/list";
import { organizationIdParamSchema, organizationSchema } from "./schema";

export const getOrganization = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("organization::view")),
    method: "get",
    path: "/{id}",
    tags: ["Organization"],
    summary: "Get an organization",
    description: "Returns a single organization by ID.",
    request: {
      params: organizationIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(organizationSchema, "The organization"),
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const org = await getOrganizationById(id);
    return c.json(org, 200);
  },
});
