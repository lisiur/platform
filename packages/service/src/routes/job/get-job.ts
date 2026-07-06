import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { jobService } from "#services/job.service";
import { jobIdParamSchema, jobSchema } from "./schema";

export const getJob = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Job"],
    summary: "Get a job",
    description: "Get job details by ID.",
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
            schema: jobSchema,
          },
        },
        description: "Job details",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const job = await jobService.getJob(id);

    return c.json(job, 200);
  },
});
