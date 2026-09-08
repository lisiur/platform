import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { listPreferences } from "../../preference.service";
import { listPreferencesResponseSchema } from "./schema";

export const getUserPreferencesRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listQianlaiPreferences",
    method: "get",
    path: "/preferences",
    tags: ["QianlaiPreference"],
    summary: "List the current user's personalization preferences (all scopes)",
    request: {},
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(
        listPreferencesResponseSchema,
        "Preferences grouped by scope; missing scopes fall back to client defaults",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const preferences = await listPreferences(userId);
    return c.json(preferences, 200);
  },
});
