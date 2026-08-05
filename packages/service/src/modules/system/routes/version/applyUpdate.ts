import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  serviceUnavailableResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { applyUpdate } from "#modules/system/version.service";
import { applyUpdateBodySchema, applyUpdateResultSchema } from "./schema";

export const applyUpdateRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "applyUpdate",
    method: "post",
    path: "/update",
    tags: ["Version"],
    summary: "Apply a self-update (OTA)",
    description:
      "Triggers an in-place server self-update: downloads the latest release tarball, extracts it over the deploy dir (preserving .env.production), runs migrations, and reloads PM2. Requires SELF_UPDATE_ENABLED=true. Returns immediately; poll /version/update/status for progress.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: applyUpdateBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...notFoundResponse,
      ...serviceUnavailableResponse,
      ...okResponseFn(applyUpdateResultSchema, "Update job accepted"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/version:update");
    const { tag } = c.req.valid("json");
    const result = await applyUpdate(tag ? { tag } : undefined);
    await logAudit({ event: "version.update_applied", category: "version", c });
    return c.json(result, 200);
  },
});
