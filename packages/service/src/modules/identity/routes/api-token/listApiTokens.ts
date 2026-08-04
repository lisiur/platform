import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { listApiTokensForUser } from "#modules/identity/api-token.service";
import { listApiTokensResponseSchema } from "./schema";

export const listApiTokens = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listApiTokens",
    method: "get",
    path: "/",
    tags: ["API Token"],
    summary: "List my API tokens",
    description: "Returns all API tokens owned by the current user.",
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(listApiTokensResponseSchema, "Your API tokens"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const tokens = await listApiTokensForUser(getPrincipalUserId(principal));
    return c.json({ tokens }, 200);
  },
});
