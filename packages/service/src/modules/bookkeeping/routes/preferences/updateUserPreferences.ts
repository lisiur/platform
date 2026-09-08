import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { updateUserPreferences } from "../../preference.service";
import { tabsDataSchema } from "./schema";

export const updateUserPreferencesRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateQianlaiUserPreferences",
    method: "put",
    path: "/preferences/user",
    tags: ["QianlaiPreference"],
    summary: "Upsert the user-scope preferences (bottom-tab arrangement)",
    request: {
      body: {
        content: {
          "application/json": { schema: tabsDataSchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...badRequestResponse,
      ...okResponseFn(tabsDataSchema, "The stored tabs payload"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const body = c.req.valid("json");
    const saved = await updateUserPreferences(userId, body);
    return c.json(saved, 200);
  },
});
