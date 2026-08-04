import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { getUserPermissionCatalog } from "#modules/access-control/public";
import { listAvailableScopesResponseSchema } from "./schema";

export const listAvailableScopes = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listAvailableScopes",
    method: "get",
    path: "/available-scopes",
    tags: ["API Token"],
    summary: "List available scopes",
    description:
      "Returns the permissions the current user holds, which can be granted to a new API token.",
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(
        listAvailableScopesResponseSchema,
        "Permissions available as token scopes",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const scopes = await getUserPermissionCatalog(
      getPrincipalUserId(principal),
    );
    return c.json({ scopes }, 200);
  },
});
