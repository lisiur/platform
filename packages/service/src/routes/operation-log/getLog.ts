import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { getLogById } from "#services/operation-log.service";
import { prepend } from "#utils/list";
import { logIdParamSchema, operationLogSchema } from "./schema";

export const getLog = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("operation-log::view")),
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
    const { id } = c.req.valid("param");
    const log = await getLogById(id);
    return c.json(log, 200);
  },
});
