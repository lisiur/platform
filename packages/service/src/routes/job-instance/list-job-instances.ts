import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { forbiddenResponse, unauthorizedResponse } from "#lib/openapi";
import { jobInstanceService } from "#services/job-instance.service";
import {
  listJobInstancesQuerySchema,
  listJobInstancesResponseSchema,
} from "./schema";

export const listJobInstances = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["Job Instance"],
    summary: "List job instances",
    description:
      "List job instances with optional filtering by status, type, or template (jobId).",
    request: {
      query: listJobInstancesQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      200: {
        content: {
          "application/json": {
            schema: listJobInstancesResponseSchema,
          },
        },
        description: "List of job instances",
      },
    },
  }),
  handler: async (c) => {
    const query = c.req.valid("query");
    const result = await jobInstanceService.listInstances({
      status: query.status,
      type: query.type,
      jobId: query.jobId,
      limit: query.limit,
      offset: query.offset,
    });

    return c.json(result, 200);
  },
});
