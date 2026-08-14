import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { updateBillingConfig as updateBillingConfigService } from "../billing.service";
import {
  billingConfigSchema,
  idParamSchema,
  updateBillingConfigBodySchema,
} from "./schema";

export const updateBillingConfig = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateBillingConfig",
    method: "put",
    path: "/configs/{id}",
    tags: ["Billing"],
    summary: "Update a billing config",
    request: {
      params: idParamSchema,
      body: {
        content: {
          "application/json": { schema: updateBillingConfigBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...okResponseFn(billingConfigSchema, "Updated billing config"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/billing-config:update");
    const { id } = c.req.valid("param");
    const config = await updateBillingConfigService(id, c.req.valid("json"));
    logAudit({ event: "billingConfig.updated", category: "billing", c });
    return c.json(config, 200);
  },
});
