import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { jobInstanceService } from "#services/job-instance.service";
import { jobInstanceIdParamSchema, jobInstanceSchema } from "./schema";

export const getJobInstance = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Job Instance"],
    summary: "Get a job instance",
    description: "Get job instance details by ID.",
    request: {
      params: jobInstanceIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      200: {
        content: {
          "application/json": {
            schema: jobInstanceSchema,
          },
        },
        description: "Job instance details",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const instance = await jobInstanceService.getInstance(id);

    return c.json(instance, 200);
  },
});
