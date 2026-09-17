import { OpenAPIHono } from "@hono/zod-openapi";
import { categorySummaryRoute } from "./categorySummary";
import { dailySummaryRoute } from "./dailySummary";
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
  dailySummaryRoute,
  categorySummaryRoute,
] as const);

export { routes as qianlaiReportRoutes };
