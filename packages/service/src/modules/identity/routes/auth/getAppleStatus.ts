import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { okResponseFn } from "#lib/openapi";
import { getAppleStatus as fetchAppleStatus } from "#modules/identity/auth.service";
import { appleStatusResponseSchema } from "./schema";

export const getAppleStatus = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getAppleStatus",
    method: "get",
    path: "/apple/status",
    tags: ["Auth"],
    summary: "Get whether Sign in with Apple is enabled",
    description:
      "Returns the effective Apple client (Services) ID so the browser SDK can be initialized; `clientId` is null when unconfigured.",
    responses: {
      ...okResponseFn(appleStatusResponseSchema, "Apple status"),
    },
  }),
  handler: async (c) => {
    const status = await fetchAppleStatus();
    return c.json(status, 200);
  },
});
