import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { releaseRateLimit } from "#services/rate-limit.service";
import { assertAccess } from "#services/role-permission.service";
import { releaseBodySchema, releaseResultSchema } from "./schema";

export const releaseRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/release",
    tags: ["RateLimit"],
    summary: "Release a rate-limited subject",
    description:
      "Manually reset a subject's counter(s) before the window expires. Optionally scope to a single limiter.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: releaseBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...okResponseFn(releaseResultSchema, "Which limiters were released"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "rate-limit::manage");
    const body = c.req.valid("json");

    const result = releaseRateLimit({
      limiter: body.limiter,
      subject: body.subject,
    });

    await logAudit({
      event: "rate_limit.released",
      category: "rate_limit",
      metadata: result,
      c,
    });

    return c.json(result, 200);
  },
});
