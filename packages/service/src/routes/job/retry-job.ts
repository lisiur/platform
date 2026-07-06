import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { jobService } from "#services/job.service";
import { jobIdParamSchema, jobSchema } from "./schema";

export const retryJob = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/{id}/retry",
    tags: ["Job"],
    summary: "Retry a failed job",
    description: "Retry a failed job by resetting its status to pending.",
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
        description: "Retried job",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const job = await jobService.retryJob(id);

    return c.json(job, 200);
  },
});
