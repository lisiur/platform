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
import { deleteCurrencyRate as deleteCurrencyRateService } from "../currency-rate.service";
import { idParamSchema } from "./schema";

export const deleteCurrencyRate = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteCurrencyRate",
    method: "delete",
    path: "/currency-rates/{id}",
    tags: ["Billing"],
    summary: "Delete a currency rate",
    request: { params: idParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(deleteSuccessSchema, "Deleted currency rate"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/billing-config:delete");
    const { id } = c.req.valid("param");
    const result = await deleteCurrencyRateService(id);
    logAudit({ event: "currencyRate.deleted", category: "billing", c });
    return c.json(result, 200);
  },
});
