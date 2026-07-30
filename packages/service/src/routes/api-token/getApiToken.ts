import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { getApiTokenForUser } from "#services/api-token.service";
import { apiTokenIdParamSchema, apiTokenSchema } from "./schema";

export const getApiToken = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getApiToken",
    method: "get",
    path: "/{id}",
    tags: ["API Token"],
    summary: "Get an API token",
    description: "Returns a single API token owned by the current user.",
    request: {
      params: apiTokenIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(apiTokenSchema, "The token"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const { id } = c.req.valid("param");
    const token = await getApiTokenForUser(getPrincipalUserId(principal), id);
    return c.json(token, 200);
  },
});
