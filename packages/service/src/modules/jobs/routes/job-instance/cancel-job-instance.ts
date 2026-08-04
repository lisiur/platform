import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { jobInstanceService } from "#modules/jobs/job-instance.service";
import { jobInstanceIdParamSchema } from "./schema";

export const cancelJobInstance = defineOpenAPIRoute({
  route: createRoute({
    operationId: "cancelJobInstance",
    method: "delete",
    path: "/{id}",
    tags: ["Job Instance"],
    summary: "Cancel a job instance",
    description: "Cancel a pending job instance by deleting it.",
    request: {
      params: jobInstanceIdParamSchema,
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
        description: "Job instance cancelled",
      },
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/job:cancel");
    const { id } = c.req.valid("param");
    await jobInstanceService.cancelInstance(id);

    return c.json({ success: true } as const, 200);
  },
});
