import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireCurrentApp } from "#extractors/current-app";
import { badRequestResponse, okResponseFn } from "#lib/openapi";
import { currentApplicationSchema, errorSchema } from "./schema";

export const getCurrentApplication = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/current",
    tags: ["Application"],
    summary: "Get current application",
    description: "Returns the application resolved from the X-App-Code header.",
    responses: {
      ...okResponseFn(currentApplicationSchema, "The current application"),
      ...badRequestResponse,
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Application not found",
      },
    },
  }),
  handler: async (c) => {
    const app = await requireCurrentApp(c);
    return c.json(
      {
        name: app.name,
        code: app.code,
        description: app.description,
        logo: app.logo,
        favicon: app.favicon,
        copyright: app.copyright,
        icp: app.icp,
        psif: app.psif,
        watermarkEnabled: app.watermarkEnabled,
        watermarkConfig: app.watermarkConfig,
      },
      200,
    );
  },
});
