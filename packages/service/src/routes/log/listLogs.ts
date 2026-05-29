import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { listLogs } from "#services/log.service";
import {
  errorSchema,
  listLogsQuerySchema,
  listLogsResponseSchema,
} from "./schema";

export const listLogsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["Log"],
    summary: "List operation logs",
    description:
      "Returns a paginated list of operation logs with optional filters.",
    middleware: requireAdmin,
    request: {
      query: listLogsQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: listLogsResponseSchema,
          },
        },
        description: "Paginated list of logs",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const query = c.req.valid("query");
    const result = await listLogs(query);
    return c.json(result, 200);
  },
});
