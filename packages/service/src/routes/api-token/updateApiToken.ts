import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { updateApiTokenForUser } from "#services/api-token.service";
import {
  apiTokenIdParamSchema,
  apiTokenSchema,
  updateApiTokenBodySchema,
} from "./schema";

export const updateApiToken = defineOpenAPIRoute({
  route: createRoute({
    method: "patch",
    path: "/{id}",
    tags: ["API Token"],
    summary: "Update an API token",
    description: "Updates an API token owned by the current user.",
    request: {
      params: apiTokenIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: updateApiTokenBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...okResponseFn(apiTokenSchema, "The updated token"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const token = await updateApiTokenForUser(
      getPrincipalUserId(principal),
      id,
      body,
    );

    logAudit({
      event: "api_token.updated",
      category: "api_token",
      c,
    });

    return c.json(token, 200);
  },
});
