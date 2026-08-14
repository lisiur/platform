import { OpenAPIHono } from "@hono/zod-openapi";
import { createBillingConfig } from "./createBillingConfig";
import { deleteBillingConfig } from "./deleteBillingConfig";
import { deleteCurrencyRate } from "./deleteCurrencyRate";
import { listBillingConfigs } from "./listBillingConfigs";
import { listCurrencyRates } from "./listCurrencyRates";
import { syncCurrencyRates } from "./syncCurrencyRates";
import { updateBillingConfig } from "./updateBillingConfig";

const billingRoutes = new OpenAPIHono();

const routes = billingRoutes.openapiRoutes([
  listBillingConfigs,
  createBillingConfig,
  updateBillingConfig,
  deleteBillingConfig,
  listCurrencyRates,
  deleteCurrencyRate,
  syncCurrencyRates,
] as const);

export { routes as billingRoutes };
