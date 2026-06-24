import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { listOrganizationsForUser } from "#services/organization.service";
import { mineOrganizationsResponseSchema } from "./schema";

export const listMyOrganizations = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/mine",
    tags: ["Organization"],
    summary: "List the current user's organizations",
    description:
      "Returns all organizations the authenticated user is a member of.",
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(
        mineOrganizationsResponseSchema,
        "Organizations the current user belongs to",
      ),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const result = await listOrganizationsForUser(session.user.id);
    return c.json(result, 200);
  },
});
