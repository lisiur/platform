import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { okResponseFn } from "#lib/openapi";
import { getSession as getSessionService } from "#services/auth.service";
import { sessionResponseSchema } from "./schema";

export const getSession = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/get-session",
    tags: ["Auth"],
    summary: "Get current session",
    responses: {
      ...okResponseFn(sessionResponseSchema, "Current session or null"),
    },
  }),
  handler: async (c) => {
    const session = await getSessionService(c.req.raw.headers);
    return c.json(session, 200);
  },
});
