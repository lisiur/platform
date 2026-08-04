import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { jobTemplateService } from "#modules/jobs/job-template.service";
import { jobInstanceSchema } from "#modules/jobs/routes/job-instance/schema";
import { jobIdParamSchema } from "./schema";

export const triggerJob = defineOpenAPIRoute({
  route: createRoute({
    operationId: "triggerJob",
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/job:trigger");
    const { id } = c.req.valid("param");
    const job = await jobTemplateService.triggerTemplate(id);

    return c.json(job, 200);
  },
});
