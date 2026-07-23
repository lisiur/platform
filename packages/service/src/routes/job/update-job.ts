import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { jobTemplateService } from "#services/job-template.service";
import { jobIdParamSchema, jobSchema, updateJobBodySchema } from "./schema";

export const updateJob = defineOpenAPIRoute({
  route: createRoute({
    method: "patch",
    path: "/{id}",
    tags: ["Job"],
    summary: "Update a job template",
    description:
      "Update a job template. Changes to cron/enabled take effect from the next scheduled run.",
    request: {
      params: jobIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: updateJobBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      200: {
        content: {
          "application/json": {
            schema: jobSchema,
          },
        },
        description: "Updated job template",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const job = await jobTemplateService.updateTemplate(id, {
      name: body.name,
      type: body.type,
      description: body.description,
      payload: body.payload,
      cronExpression: body.cronExpression,
      enabled: body.enabled,
      priority: body.priority,
      maxAttempts: body.maxAttempts,
      timeoutMs: body.timeoutMs,
    });

    return c.json(job, 200);
  },
});
