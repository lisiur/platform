import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import { logAudit } from "#lib/logger";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { cancelUpdate } from "#modules/system/version.service";
import { cancelUpdateResultSchema } from "./schema";

export const cancelUpdateRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "cancelUpdate",
    method: "post",
    path: "/update/cancel",
    tags: ["Version"],
    summary: "Cancel an in-progress self-update download",
    description:
      "Cancels the download phase of a running self-update. Only works while the update is still downloading the tarball.",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...conflictResponse,
      ...okResponseFn(cancelUpdateResultSchema, "Cancellation requested"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/version:update");
    await cancelUpdate();
    await logAudit({
      event: "version.update_cancelled",
      category: "version",
      c,
    });
    return c.json({ cancelled: true }, 200);
  },
});
