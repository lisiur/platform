import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { updateQuota as updateQuotaService } from "#modules/pricing/quota.service";
import {
  quotaIdParamSchema,
  quotaSchema,
  updateQuotaBodySchema,
} from "./schema";

export const updateQuotaRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateQuota",
    method: "put",
    path: "/{id}",
    tags: ["Quotas"],
    summary: "Update a user quota",
    request: {
      params: quotaIdParamSchema,
      body: {
        content: { "application/json": { schema: updateQuotaBodySchema } },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(quotaSchema, "The updated quota"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/quota:update");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const quota = await updateQuotaService(id, body);
    return c.json(quota, 200);
  },
});
