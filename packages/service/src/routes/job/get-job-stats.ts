import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { forbiddenResponse, unauthorizedResponse } from "#lib/openapi";
import { jobInstanceService } from "#services/job-instance.service";
import { assertAccess } from "#services/role-permission.service";
import { jobExecutorStatsSchema } from "./schema";

export const getJobStats = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getJobStats",
    method: "get",
    path: "/stats",
    tags: ["Job"],
    summary: "Get job executor stats",
    description:
      "Returns live executor runtime stats (queue size, pending, concurrency) and database aggregate counts grouped by status.",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      200: {
        content: {
          "application/json": {
            schema: jobExecutorStatsSchema,
          },
        },
        description: "Job executor stats",
      },
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/job:view");
    const stats = await jobInstanceService.getExecutorStats();

    return c.json(stats, 200);
  },
});
