import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { jobTemplateService } from "#modules/jobs/job-template.service";
import { jobIdParamSchema } from "./schema";

export const deleteJob = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteJob",
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
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/job:delete");
    const { id } = c.req.valid("param");
    await jobTemplateService.deleteTemplate(id);

    return c.json({ success: true } as const, 200);
  },
});
