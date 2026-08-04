import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { okResponseFn } from "#lib/openapi";
import { getRegistrationEnabled } from "#modules/identity/auth.service";
import { registrationStatusSchema } from "./schema";

export const getRegistrationStatus = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getRegistrationStatus",
    method: "get",
    path: "/registration-status",
    tags: ["Auth"],
    summary: "Get whether new user registration is enabled",
    responses: {
      ...okResponseFn(registrationStatusSchema, "Registration status"),
    },
  }),
  handler: async (c) => {
    const registrationEnabled = await getRegistrationEnabled();
    return c.json({ registrationEnabled }, 200);
  },
});
