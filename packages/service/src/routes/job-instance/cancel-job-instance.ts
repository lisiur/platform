import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { jobInstanceService } from "#services/job-instance.service";
import { jobInstanceIdParamSchema } from "./schema";

export const cancelJobInstance = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Job Instance"],
    summary: "Cancel a job instance",
    description: "Cancel a pending job instance by deleting it.",
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
            schema: deleteSuccessSchema,
          },
        },
        description: "Job instance cancelled",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    await jobInstanceService.cancelInstance(id);

    return c.json({ success: true } as const, 200);
  },
});
