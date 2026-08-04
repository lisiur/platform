import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listLogs } from "#modules/audit/operation-log.service";
import { listLogsQuerySchema, listLogsResponseSchema } from "./schema";

export const listLogsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listLogs",
    method: "get",
    path: "/",
    tags: ["Log"],
    summary: "List operation logs",
    description:
      "Returns a paginated list of operation logs with optional filters.",
    request: {
      query: listLogsQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(listLogsResponseSchema, "Paginated list of logs"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/operation-log:list");
    const query = c.req.valid("query");
    const result = await listLogs(query);
    return c.json(result, 200);
  },
});
