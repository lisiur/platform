import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireProjectAccess } from "../../access";
import { updateProjectPreferences } from "../../preference.service";
import { projectIdParamSchema, quickEntryDataSchema } from "./schema";

export const updateProjectPreferencesRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateQianlaiProjectPreferences",
    method: "put",
    path: "/preferences/project/{projectId}",
    tags: ["QianlaiPreference"],
    summary:
      "Upsert the caller's project-scope preferences (quick-entry chips); anyone who can see the project",
    request: {
      params: projectIdParamSchema,
      body: {
        content: {
          "application/json": { schema: quickEntryDataSchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...okResponseFn(quickEntryDataSchema, "The stored quick-entry payload"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { projectId } = c.req.valid("param");
    const body = c.req.valid("json");
    // Default minRole "guest": ledger guests with a ProjectMember row (and
    // all full roles) may arrange their own chips for this project.
    await requireProjectAccess(userId, projectId);
    const saved = await updateProjectPreferences(userId, projectId, body);
    return c.json(saved, 200);
  },
});
