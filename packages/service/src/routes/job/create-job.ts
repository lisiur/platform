import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { jobTemplateService } from "#services/job-template.service";
import { createJobBodySchema, jobSchema } from "./schema";

export const createJob = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["Job"],
    summary: "Create a job template",
    description:
      "Create a job template (recurring via cron or manual-trigger only).",
    request: {
      body: {
        content: {
          "application/json": {
            schema: createJobBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...createdResponseFn(jobSchema, "The created job template"),
    },
  }),
  handler: async (c) => {
    const body = c.req.valid("json");

    const job = await jobTemplateService.createTemplate({
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

    return c.json(job, 201);
  },
});
