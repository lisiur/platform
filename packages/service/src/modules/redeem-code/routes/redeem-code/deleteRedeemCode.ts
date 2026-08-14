import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { deleteRedeemCode as deleteRedeemCodeService } from "#modules/redeem-code/redeem-code.service";
import { redeemCodeIdParamSchema } from "./schema";

export const deleteRedeemCode = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteRedeemCode",
    method: "delete",
    path: "/{id}",
    tags: ["RedeemCode"],
    summary: "Delete a redeem code",
    request: {
      params: redeemCodeIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      200: {
        content: { "application/json": { schema: deleteSuccessSchema } },
        description: "Deleted redeem code",
      },
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/redeem-code:delete");
    const { id } = c.req.valid("param");
    await deleteRedeemCodeService(id);
    logAudit({ event: "redeemCode.deleted", category: "redeem-code", c });
    return c.json({ success: true as const }, 200);
  },
});
