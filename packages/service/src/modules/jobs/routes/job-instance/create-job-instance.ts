import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  createdResponseFn,
  forbiddenResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { jobInstanceService } from "#modules/jobs/job-instance.service";
import { createJobInstanceBodySchema, jobInstanceSchema } from "./schema";

export const createJobInstance = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createJobInstance",
    method: "post",
    path: "/",
    tags: ["Job Instance"],
    summary: "Create an ad-hoc job instance",
    description: "Create and enqueue a one-shot job instance (no template).",
    request: {
      body: {
        content: {
          "application/json": {
            schema: createJobInstanceBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...createdResponseFn(jobInstanceSchema, "The created job instance"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/job:create");
    const body = c.req.valid("json");
    const scheduledAt = body.scheduledAt
      ? new Date(body.scheduledAt)
      : undefined;

    const instance = await jobInstanceService.createInstance({
      type: body.type,
      description: body.description,
      payload: body.payload,
      priority: body.priority,
      scheduledAt,
      maxAttempts: body.maxAttempts,
      timeoutMs: body.timeoutMs,
    });

    return c.json(instance, 201);
  },
});
