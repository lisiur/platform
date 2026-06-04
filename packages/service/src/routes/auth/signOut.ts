import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { okResponseFn } from "#lib/openapi";
import { deleteSessionCookie, getSessionTokenFromContext } from "#lib/session";
import { signOut as signOutService } from "#services/auth.service";
import { authMutationResponseSchema } from "./schema";

export const signOut = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/sign-out",
    tags: ["Auth"],
    summary: "Sign out current session",
    responses: {
      ...okResponseFn(authMutationResponseSchema, "Signed out"),
    },
  }),
  handler: async (c) => {
    await signOutService(getSessionTokenFromContext(c), c.get("traceId"));
    deleteSessionCookie(c);
    return c.json({ data: { success: true }, error: null }, 200);
  },
});
