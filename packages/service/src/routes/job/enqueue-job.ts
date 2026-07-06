import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { jobService } from "#services/job.service";
import { createJobBodySchema, jobSchema } from "./schema";

export const enqueueJob = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["Job"],
    summary: "Enqueue a new job",
    description: "Create and enqueue a new background job.",
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
      ...createdResponseFn(jobSchema, "The enqueued job"),
    },
  }),
  handler: async (c) => {
    const body = c.req.valid("json");
    const scheduledAt = body.scheduledAt
      ? new Date(body.scheduledAt)
      : undefined;

    const job = await jobService.createJob({
      type: body.type,
      payload: body.payload,
      priority: body.priority,
      scheduledAt,
      maxAttempts: body.maxAttempts,
      timeoutMs: body.timeoutMs,
    });

    return c.json(job, 201);
  },
});
