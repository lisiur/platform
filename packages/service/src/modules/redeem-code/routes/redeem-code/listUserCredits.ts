import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listUserCredits as listUserCreditsService } from "#modules/redeem-code/redeem-code.service";
import {
  listRedeemCodesQuerySchema,
  listUserCreditsResponseSchema,
} from "./schema";

export const listUserCredits = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listUserCredits",
    method: "get",
    path: "/credits",
    tags: ["RedeemCode"],
    summary: "List user credits (admin)",
    request: {
      query: listRedeemCodesQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(listUserCreditsResponseSchema, "List of user credits"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/user-credit:list");
    const { limit, offset } = c.req.valid("query");
    const result = await listUserCreditsService(limit, offset);
    return c.json(result, 200);
  },
});
