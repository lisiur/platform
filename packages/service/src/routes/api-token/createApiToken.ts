import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { createApiTokenForUser } from "#services/api-token.service";
import {
  createApiTokenBodySchema,
  createApiTokenResponseSchema,
  errorSchema,
} from "./schema";

export const createApiToken = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["API Token"],
    summary: "Create an API token",
    description:
      "Creates a personal API token for the current user. The full token string is returned only once.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: createApiTokenBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...createdResponseFn(createApiTokenResponseSchema, "The created token"),
      409: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Scopes exceed your permissions",
      },
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const body = c.req.valid("json");

    const result = await createApiTokenForUser({
      ownerId: getPrincipalUserId(principal),
      name: body.name,
      scopes: body.scopes,
      organizationId: body.organizationId ?? null,
      appId: body.appId ?? null,
      expiresAt: body.expiresAt ?? null,
    });

    logAudit({
      event: "api_token.created",
      category: "api_token",
      c,
    });

    return c.json(result, 201);
  },
});
