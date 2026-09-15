import { OpenAPIHono } from "@hono/zod-openapi";
import { closeYearBudgetRoute } from "./closeYearBudget";
import { getBudgetRoute } from "./getBudget";
import { getBudgetReportRoute } from "./getBudgetReport";
import { setExcludedCategoriesRoute } from "./setExcludedCategories";
import { setMonthBudgetRoute } from "./setMonthBudget";
import { setYearBudgetRoute } from "./setYearBudget";

const budgetRoutes = new OpenAPIHono();

const routes = budgetRoutes.openapiRoutes([
  getBudgetRoute,
  setYearBudgetRoute,
  setMonthBudgetRoute,
  setExcludedCategoriesRoute,
  closeYearBudgetRoute,
  getBudgetReportRoute,
] as const);

export { routes as qianlaiBudgetRoutes };
