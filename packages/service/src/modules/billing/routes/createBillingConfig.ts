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
import { createBillingConfig as createBillingConfigService } from "../billing.service";
import { billingConfigSchema, createBillingConfigBodySchema } from "./schema";

export const createBillingConfig = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createBillingConfig",
    method: "post",
    path: "/configs",
    tags: ["Billing"],
    summary: "Create a billing config",
    request: {
      body: {
        content: {
          "application/json": { schema: createBillingConfigBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...createdResponseFn(billingConfigSchema, "Created billing config"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/billing-config:create");
    const config = await createBillingConfigService(c.req.valid("json"));
    logAudit({ event: "billingConfig.created", category: "billing", c });
    return c.json(config, 201);
  },
});
