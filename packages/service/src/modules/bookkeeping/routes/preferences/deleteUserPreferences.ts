import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  deleteSuccessSchema,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { clearPreferences } from "../../preference.service";

export const deleteUserPreferencesRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteQianlaiUserPreferences",
    method: "delete",
    path: "/preferences/user",
    tags: ["QianlaiPreference"],
    summary: "Reset the user-scope preferences (bottom tabs) to defaults",
    request: {},
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(deleteSuccessSchema, "Reset succeeded (idempotent)"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    await clearPreferences(userId, "user", "");
    return c.json({ success: true as const }, 200);
  },
});
