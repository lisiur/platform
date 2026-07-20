import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  notFoundResponse,
  okResponseFn,
  successSchema,
  unauthorizedResponse,
} from "#lib/openapi";
import { deleteApiTokenForUser } from "#services/api-token.service";
import { apiTokenIdParamSchema } from "./schema";

export const deleteApiToken = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["API Token"],
    summary: "Revoke an API token",
    description: "Permanently deletes an API token owned by the current user.",
    request: {
      params: apiTokenIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(successSchema, "Successfully revoked"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { id } = c.req.valid("param");

    const _token = await deleteApiTokenForUser(
      getPrincipalUserId(principal),
      id,
    );

    logAudit({
      event: "api_token.revoked",
      category: "api_token",
      c,
    });

    return c.json({ success: true }, 200);
  },
});
