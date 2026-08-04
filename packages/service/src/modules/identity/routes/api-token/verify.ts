import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireBearerToken } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { apiTokenSchema } from "./schema";

export const verifyApiToken = defineOpenAPIRoute({
  route: createRoute({
    operationId: "verifyApiToken",
    method: "get",
    path: "/verify",
    tags: ["API Token"],
    summary: "Verify an API token",
    description:
      "Returns the metadata of the authenticated token. The token is passed via the Authorization header as a Bearer token.",
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(apiTokenSchema, "The token"),
    },
  }),
  handler: async (c) => {
    const principal = await requireBearerToken(c);
    return c.json(principal.token, 200);
  },
});
