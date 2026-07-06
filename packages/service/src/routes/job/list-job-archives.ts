import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { forbiddenResponse, unauthorizedResponse } from "#lib/openapi";
import { jobService } from "#services/job.service";
import { listJobArchivesResponseSchema, listJobsQuerySchema } from "./schema";

export const listJobArchives = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/archive",
    tags: ["Job"],
    summary: "List archived jobs",
    description:
      "List archived jobs with optional filtering by status or type.",
    request: {
      query: listJobsQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      200: {
        content: {
          "application/json": {
            schema: listJobArchivesResponseSchema,
          },
        },
        description: "List of archived jobs",
      },
    },
  }),
  handler: async (c) => {
    const query = c.req.valid("query");
    const result = await jobService.listArchivedJobs({
      status: query.status,
      type: query.type,
      limit: query.limit,
      offset: query.offset,
    });

    return c.json(result, 200);
  },
});
