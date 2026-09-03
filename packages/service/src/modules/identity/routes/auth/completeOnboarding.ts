import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { completeOnboarding } from "#modules/identity/auth.service";
import { userMutationResponseSchema } from "./schema";

export const completeOnboardingRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "completeOnboarding",
    method: "post",
    path: "/complete-onboarding",
    tags: ["Auth"],
    summary: "Complete first-login onboarding",
    description:
      "Clears the caller's onboarding-pending flag. Idempotent; other flags are preserved.",
    request: {},
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
    const { user } = await completeOnboarding(getPrincipalUserId(principal));

    return c.json({ user }, 200);
  },
});
