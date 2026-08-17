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
import { currencyParamSchema } from "./schema";

export const deleteCurrencyRate = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteCurrencyRate",
    method: "delete",
    path: "/currency-rates/{currency}",
    tags: ["Billing"],
    summary: "Delete a currency rate",
    request: { params: currencyParamSchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(deleteSuccessSchema, "Deleted currency rate"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/billing-config:delete");
    const { currency } = c.req.valid("param");
    const result = await deleteCurrencyRateService(currency);
    logAudit({ event: "currencyRate.deleted", category: "billing", c });
    return c.json(result, 200);
  },
});
