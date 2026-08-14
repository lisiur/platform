import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listRedeemCodes as listRedeemCodesService } from "#modules/redeem-code/redeem-code.service";
import {
  listRedeemCodesQuerySchema,
  listRedeemCodesResponseSchema,
} from "./schema";

export const listRedeemCodes = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listRedeemCodes",
    method: "get",
    path: "/",
    tags: ["RedeemCode"],
    summary: "List redeem codes",
    request: {
      query: listRedeemCodesQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(listRedeemCodesResponseSchema, "List of redeem codes"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/redeem-code:list");
    const { limit, offset } = c.req.valid("query");
    const result = await listRedeemCodesService(limit, offset);
    return c.json(result, 200);
  },
});
