import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { readUpdateStatus } from "#modules/system/version.service";
import { updateStatusSchema } from "./schema";

export const getUpdateStatusRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getUpdateStatus",
    method: "get",
    path: "/update/status",
    tags: ["Version"],
    summary: "Get the current self-update status",
    description:
      "Returns the phase, step, and message of the most recent (or in-progress) self-update. Used to poll progress after POST /version/update.",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(updateStatusSchema, "Current update status"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/version:view");
    return c.json(await readUpdateStatus(), 200);
  },
});
