import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { forbiddenResponse, unauthorizedResponse } from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { jobTemplateService } from "#modules/jobs/job-template.service";
import { listJobsQuerySchema, listJobsResponseSchema } from "./schema";

export const listJobs = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listJobs",
    method: "get",
    path: "/",
    tags: ["Job"],
    summary: "List job templates",
    description:
      "List all job templates with optional filtering by enabled or type.",
    request: {
      query: listJobsQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      200: {
        content: {
          "application/json": {
            schema: listJobsResponseSchema,
          },
        },
        description: "List of job templates",
      },
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/job:list");
    const query = c.req.valid("query");
    const result = await jobTemplateService.listTemplates({
      enabled: query.enabled,
      type: query.type,
      limit: query.limit,
      offset: query.offset,
    });

    return c.json(result, 200);
  },
});
