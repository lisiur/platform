import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { getLogById } from "#services/operation-log.service";
import { assertAccess } from "#services/role-permission.service";
import { logIdParamSchema, operationLogSchema } from "./schema";

export const getLog = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getLog",
    method: "get",
    path: "/{id}",
    tags: ["Log"],
    summary: "Get a log entry",
    description: "Returns a single operation log by ID.",
    request: {
      params: logIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(operationLogSchema, "The log entry"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/operation-log:view");
    const { id } = c.req.valid("param");
    const log = await getLogById(id);
    return c.json(log, 200);
  },
});
