import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requireProjectAccess } from "../../access";
import { clearPreferences } from "../../preference.service";
import { projectIdParamSchema } from "./schema";

export const deleteProjectPreferencesRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteQianlaiProjectPreferences",
    method: "delete",
    path: "/preferences/project/{projectId}",
    tags: ["QianlaiPreference"],
    summary:
      "Reset the caller's project-scope preferences to defaults; any current project member including guests",
    request: {
      params: projectIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Reset succeeded (idempotent)"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { projectId } = c.req.valid("param");
    // Same ownership model as the ledger scope: preference rows belong to
    // their project, the row's userId only marks the creator, and resets
    // need membership. The where clause still keys on the caller's own
    // userId, so a reset can only ever clear the caller's own row.
    await requireProjectAccess(userId, projectId);
    await clearPreferences(userId, "project", projectId);
    return c.json({ success: true as const }, 200);
  },
});
