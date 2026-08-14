import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listBillingConfigs as listBillingConfigsService } from "../billing.service";
import {
  listBillingConfigsQuerySchema,
  listBillingConfigsResponseSchema,
} from "./schema";

export const listBillingConfigs = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listBillingConfigs",
    method: "get",
    path: "/configs",
    tags: ["Billing"],
    summary: "List billing configs",
    request: { query: listBillingConfigsQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(listBillingConfigsResponseSchema, "List billing configs"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/billing-config:list");
    const query = c.req.valid("query");
    const result = await listBillingConfigsService(query);
    return c.json(result, 200);
  },
});
