import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { updateRedeemCode as updateRedeemCodeService } from "#modules/redeem-code/redeem-code.service";
import {
  redeemCodeIdParamSchema,
  redeemCodeSchema,
  updateRedeemCodeBodySchema,
} from "./schema";

export const updateRedeemCode = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateRedeemCode",
    method: "put",
    path: "/{id}",
    tags: ["RedeemCode"],
    summary: "Update a redeem code",
    request: {
      params: redeemCodeIdParamSchema,
      body: {
        content: { "application/json": { schema: updateRedeemCodeBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...notFoundResponse,
      ...okResponseFn(redeemCodeSchema, "Updated redeem code"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/redeem-code:update");
    const { id } = c.req.valid("param");
    const { credit, enabled, expiresAt } = c.req.valid("json");
    const redeemCode = await updateRedeemCodeService(id, {
      credit,
      enabled,
      expiresAt:
        expiresAt !== undefined
          ? expiresAt
            ? new Date(expiresAt)
            : null
          : undefined,
    });
    logAudit({ event: "redeemCode.updated", category: "redeem-code", c });
    return c.json(redeemCode, 200);
  },
});
