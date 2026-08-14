import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { deleteBillingConfig as deleteBillingConfigService } from "../billing.service";
import { idParamSchema } from "./schema";

export const deleteBillingConfig = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteBillingConfig",
    method: "delete",
    path: "/configs/{id}",
    tags: ["Billing"],
    summary: "Delete a billing config",
    request: { params: idParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(deleteSuccessSchema, "Deleted billing config"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/billing-config:delete");
    const { id } = c.req.valid("param");
    const result = await deleteBillingConfigService(id);
    logAudit({ event: "billingConfig.deleted", category: "billing", c });
    return c.json(result, 200);
  },
});
