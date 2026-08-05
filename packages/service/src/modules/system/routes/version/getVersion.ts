import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { APP_BUILD_TIME, APP_GIT_SHA, APP_VERSION } from "@repo/shared";
import { okResponseFn } from "#lib/openapi";
import { versionInfoSchema } from "./schema";

export const getVersion = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getVersion",
    method: "get",
    path: "/",
    tags: ["Version"],
    summary: "Get application version",
    description:
      "Returns the build version, git short sha, and build time. Public endpoint; no session required.",
    responses: {
      ...okResponseFn(versionInfoSchema, "Application version information"),
    },
  }),
  handler: async (c) => {
    return c.json(
      {
        version: APP_VERSION,
        gitSha: APP_GIT_SHA,
        buildTime: APP_BUILD_TIME,
      },
      200,
    );
  },
});
