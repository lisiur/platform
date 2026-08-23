import { OpenAPIHono } from "@hono/zod-openapi";
import { dashboardRoute } from "./dashboard";
import { incomeStatementRoute } from "./incomeStatement";
import { trialBalanceRoute } from "./trialBalance";

const reportRoutes = new OpenAPIHono();

const routes = reportRoutes.openapiRoutes([
  dashboardRoute,
  trialBalanceRoute,
  incomeStatementRoute,
] as const);

export { routes as qianlaiReportRoutes };
