import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { updateUserProfile } from "#services/user.service";
import { updateUserBodySchema, userMutationResponseSchema } from "./schema";

export const updateUser = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/update-user",
    tags: ["Auth"],
    summary: "Update current user profile",
    request: {
      body: {
        content: { "application/json": { schema: updateUserBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(userMutationResponseSchema, "Updated user"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    if (principal.kind !== "user") {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    const body = c.req.valid("json");
    const { user } = await updateUserProfile(
      getPrincipalUserId(principal),
      body,
    );

    return c.json({ user }, 200);
  },
});
