import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { jobService } from "../job.service";
import {
  jobIdParamSchema,
} from "./schema";
import { notFoundResponse, unauthorizedResponse, forbiddenResponse } from "#lib/openapi";
import { deleteSuccessSchema } from "#lib/openapi";

export const cancelJob = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Job"],
    summary: "Cancel a job",
    description: "Cancel a pending job by deleting it.",
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
            schema: deleteSuccessSchema,
          },
        },
        description: "Job cancelled",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    await jobService.cancelJob(id);

    return c.json({ success: true }, 200);
  },
});
