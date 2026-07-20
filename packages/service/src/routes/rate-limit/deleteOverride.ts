import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { deleteOverride } from "#services/rate-limit.service";
import { assertAccess } from "#services/role-permission.service";
import { upsertOverrideParamSchema } from "./schema";

export const deleteOverrideRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/overrides/{subject}",
    tags: ["RateLimit"],
    summary: "Delete a rate-limit override",
    description:
      "Remove an override rule so the subject falls back to default policy.",
    request: {
      params: upsertOverrideParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...okResponseFn(deleteSuccessSchema, "Deletion result"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "rate-limit::manage");
    const { subject } = c.req.valid("param");

    const ok = await deleteOverride(subject);
    if (!ok) {
      throw new HTTPException(404, { message: "Override not found" });
    }

    await logAudit({
      event: "rate_limit.override.deleted",
      category: "rate_limit",
      c,
    });

    return c.json({ success: true as const }, 200);
  },
});
