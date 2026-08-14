import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { getUserCredit as getUserCreditService } from "#modules/redeem-code/redeem-code.service";
import { userCreditSchema } from "./schema";

export const getMyCredit = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getMyCredit",
    method: "get",
    path: "/me/credit",
    tags: ["RedeemCode"],
    summary: "Get current user's credit balance",
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(userCreditSchema, "User credit balance"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const credit = await getUserCreditService(userId);
    return c.json(credit, 200);
  },
});
