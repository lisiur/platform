import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { adjustUserCredit as adjustUserCreditService } from "#modules/redeem-code/redeem-code.service";
import {
  adjustUserCreditBodySchema,
  userCreditSchema,
  userCreditUserIdParamSchema,
} from "./schema";

export const adjustUserCredit = defineOpenAPIRoute({
  route: createRoute({
    operationId: "adjustUserCredit",
    method: "post",
    path: "/credits/{userId}/adjust",
    tags: ["RedeemCode"],
    summary: "Grant or deduct a user's credits (admin)",
    request: {
      params: userCreditUserIdParamSchema,
      body: {
        content: { "application/json": { schema: adjustUserCreditBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...notFoundResponse,
      ...okResponseFn(userCreditSchema, "Updated user credit"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/user-credit:update");
    const { userId } = c.req.valid("param");
    const { amount, description } = c.req.valid("json");
    const credit = await adjustUserCreditService(
      userId,
      amount,
      description,
      getPrincipalUserId(principal),
    );
    logAudit({ event: "userCredit.adjusted", category: "user-credit", c });
    return c.json(credit, 200);
  },
});
