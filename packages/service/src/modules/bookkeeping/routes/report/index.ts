import { OpenAPIHono } from "@hono/zod-openapi";
import { dashboardRoute } from "./dashboard";
import { incomeStatementRoute } from "./incomeStatement";
import { memberTurnoverRoute } from "./memberTurnover";
import { trialBalanceRoute } from "./trialBalance";

const reportRoutes = new OpenAPIHono();

const routes = reportRoutes.openapiRoutes([
  dashboardRoute,
  trialBalanceRoute,
  incomeStatementRoute,
  memberTurnoverRoute,
] as const);

export { routes as qianlaiReportRoutes };
