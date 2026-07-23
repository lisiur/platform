import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { jobTemplateService } from "#services/job-template.service";
import { jobIdParamSchema } from "./schema";

export const deleteJob = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Job"],
    summary: "Delete a job template",
    description:
      "Delete a job template. Existing instances become standalone (jobId set to null).",
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
        description: "Job template deleted",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    await jobTemplateService.deleteTemplate(id);

    return c.json({ success: true } as const, 200);
  },
});
