import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { jobService } from "#services/job.service";
import { jobArchiveSchema, jobIdParamSchema } from "./schema";

export const getJobArchive = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/archive/{id}",
    tags: ["Job"],
    summary: "Get an archived job",
    description: "Get archived job details by ID.",
    request: {
      params: jobIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      200: {
        content: {
          "application/json": {
            schema: jobArchiveSchema,
          },
        },
        description: "Archived job details",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const job = await jobService.getArchivedJob(id);

    return c.json(job, 200);
  },
});
