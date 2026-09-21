import { OpenAPIHono } from "@hono/zod-openapi";
import { deleteCategoryBudgetRoute } from "./deleteCategoryBudget";
import { getCategoryBudgetReportRoute } from "./getCategoryBudgetReport";
import { getCategoryBudgetsRoute } from "./getCategoryBudgets";
import { upsertCategoryBudgetRoute } from "./upsertCategoryBudget";

const categoryBudgetRoutes = new OpenAPIHono();

const routes = categoryBudgetRoutes.openapiRoutes([
  getCategoryBudgetsRoute,
  upsertCategoryBudgetRoute,
  deleteCategoryBudgetRoute,
  getCategoryBudgetReportRoute,
] as const);

export { routes as qianlaiCategoryBudgetRoutes };
