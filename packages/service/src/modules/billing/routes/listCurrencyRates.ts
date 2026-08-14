import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listCurrencyRates as listCurrencyRatesService } from "../currency-rate.service";
import {
  listCurrencyRatesQuerySchema,
  listCurrencyRatesResponseSchema,
} from "./schema";

export const listCurrencyRates = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listCurrencyRates",
    method: "get",
    path: "/currency-rates",
    tags: ["Billing"],
    summary: "List currency rates",
    request: { query: listCurrencyRatesQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(listCurrencyRatesResponseSchema, "List currency rates"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/billing-config:list");
    const result = await listCurrencyRatesService(c.req.valid("query"));
    return c.json(result, 200);
  },
});
