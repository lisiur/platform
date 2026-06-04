import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { updateUser as updateUserService } from "#services/auth.service";
import {
  authMutationResponseSchema,
  updateUserBodySchema,
} from "./schema";

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
      ...okResponseFn(authMutationResponseSchema, "Updated user"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    const body = c.req.valid("json");
    const { user } = await updateUserService({
      userId: session.user.id,
      data: body,
    });

    return c.json({ data: { user }, error: null }, 200);
  },
});
