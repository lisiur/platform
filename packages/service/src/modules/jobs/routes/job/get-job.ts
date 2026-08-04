import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { jobTemplateService } from "#modules/jobs/job-template.service";
import { jobIdParamSchema, jobSchema } from "./schema";

export const getJob = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getJob",
    method: "get",
    path: "/{id}",
    tags: ["Job"],
    summary: "Get a job template",
    description: "Get job template details by ID.",
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
            schema: jobSchema,
          },
        },
        description: "Job template details",
      },
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/job:view");
    const { id } = c.req.valid("param");
    const job = await jobTemplateService.getTemplate(id);

    return c.json(job, 200);
  },
});
