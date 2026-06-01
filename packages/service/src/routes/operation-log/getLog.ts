import { getLogById } from "#services/operation-log.service";
import { defineAdminRoute } from "../shared/admin-route";
import { errorSchema, logIdParamSchema, operationLogSchema } from "./schema";

export const getLog = defineAdminRoute({
  route: {
    method: "get",
    path: "/{id}",
    tags: ["Log"],
    summary: "Get a log entry",
    description: "Returns a single operation log by ID.",
    request: {
      params: logIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: operationLogSchema },
        },
        description: "The log entry",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
    },
  },
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const log = await getLogById(id);
    return c.json(log, 200);
  },
});
