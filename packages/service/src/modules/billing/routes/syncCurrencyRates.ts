import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { syncCurrencyRates as syncCurrencyRatesService } from "../currency-rate.service";
import { syncCurrencyRatesResponseSchema } from "./schema";

export const syncCurrencyRates = defineOpenAPIRoute({
  route: createRoute({
    operationId: "syncCurrencyRates",
    method: "post",
    path: "/currency-rates/sync",
    tags: ["Billing"],
    summary: "Sync currency rates from the public exchange API",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(syncCurrencyRatesResponseSchema, "Synced currency rates"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/billing-config:update");
    const result = await syncCurrencyRatesService();
    logAudit({ event: "currencyRate.synced", category: "billing", c });
    return c.json(result, 200);
  },
});
