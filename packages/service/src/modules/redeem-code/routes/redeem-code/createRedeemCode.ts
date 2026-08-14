import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { createRedeemCode as createRedeemCodeService } from "#modules/redeem-code/redeem-code.service";
import { createRedeemCodeBodySchema, redeemCodeSchema } from "./schema";

export const createRedeemCode = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createRedeemCode",
    method: "post",
    path: "/",
    tags: ["RedeemCode"],
    summary: "Create a redeem code",
    request: {
      body: {
        content: { "application/json": { schema: createRedeemCodeBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...createdResponseFn(redeemCodeSchema, "Created redeem code"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/redeem-code:create");
    const { credit, expiresAt } = c.req.valid("json");
    const redeemCode = await createRedeemCodeService({
      credit,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });
    logAudit({ event: "redeemCode.created", category: "redeem-code", c });
    return c.json(redeemCode, 201);
  },
});
