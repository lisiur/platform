import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { jobInstanceSchema } from "#routes/job-instance/schema";
import { jobTemplateService } from "#services/job-template.service";
import { jobIdParamSchema } from "./schema";

export const triggerJob = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/{id}/trigger",
    tags: ["Job"],
    summary: "Trigger a job template",
    description:
      "Create and enqueue a job instance from this template immediately, without affecting the recurring schedule.",
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
            schema: jobInstanceSchema,
          },
        },
        description: "Triggered job instance",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const job = await jobTemplateService.triggerTemplate(id);

    return c.json(job, 200);
  },
});
