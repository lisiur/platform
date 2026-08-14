import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { redeemCode as redeemCodeService } from "#modules/redeem-code/redeem-code.service";
import { redeemCodeBodySchema, redeemResponseSchema } from "./schema";

export const redeemCode = defineOpenAPIRoute({
  route: createRoute({
    operationId: "redeemCode",
    method: "post",
    path: "/redeem",
    tags: ["RedeemCode"],
    summary: "Redeem a code to top up credits",
    request: {
      body: {
        content: { "application/json": { schema: redeemCodeBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...badRequestResponse,
      ...notFoundResponse,
      ...okResponseFn(redeemResponseSchema, "Redeemed successfully"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { code } = c.req.valid("json");
    const result = await redeemCodeService(userId, code);
    return c.json(result, 200);
  },
});
