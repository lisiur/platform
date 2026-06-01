import { listLogs } from "#services/operation-log.service";
import { defineAdminRoute } from "../shared/admin-route";
import { listLogsQuerySchema, listLogsResponseSchema } from "./schema";

export const listLogsRoute = defineAdminRoute({
  route: {
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
      200: {
        content: {
          "application/json": {
            schema: listLogsResponseSchema,
          },
        },
        description: "Paginated list of logs",
      },
    },
  },
  handler: async (c) => {
    const query = c.req.valid("query");
    const result = await listLogs(query);
    return c.json(result, 200);
  },
});
