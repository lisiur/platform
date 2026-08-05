import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  serviceUnavailableResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { getLatestRelease } from "#modules/system/version.service";
import { latestReleaseSchema } from "./schema";

export const getLatestRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getLatestVersion",
    method: "get",
    path: "/latest",
    tags: ["Version"],
    summary: "Check for the latest release",
    description:
      "Queries the configured self-update source for the latest release and reports whether it is newer than the running build.",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...badRequestResponse,
      ...notFoundResponse,
      ...serviceUnavailableResponse,
      ...okResponseFn(latestReleaseSchema, "Latest release information"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/version:view");
    const latest = await getLatestRelease();
    return c.json(latest, 200);
  },
});
