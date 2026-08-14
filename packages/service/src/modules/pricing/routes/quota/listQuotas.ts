import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listQuotas as listQuotasService } from "#modules/pricing/quota.service";
import { listQuotasQuerySchema, listQuotasResponseSchema } from "./schema";

export const listQuotasRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listQuotas",
    method: "get",
    path: "/",
    tags: ["Quotas"],
    summary: "List user quotas",
    request: { query: listQuotasQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(listQuotasResponseSchema, "Paginated list of quotas"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/quota:list");
    const { search, limit, offset } = c.req.valid("query");
    const result = await listQuotasService({ search, limit, offset });
    return c.json(result, 200);
  },
});
