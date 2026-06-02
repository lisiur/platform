import { definePermissionRoute } from "../shared/admin-route";
import { applicationSchema, errorSchema } from "./schema";

export const getCurrentApplication = definePermissionRoute({
  permission: "application::view",
  route: {
    method: "get",
    path: "/current",
    tags: ["Application"],
    summary: "Get current application",
    description: "Returns the application resolved from the X-App-Code header.",
    responses: {
      200: {
        content: {
          "application/json": { schema: applicationSchema },
        },
        description: "The current application",
      },
      400: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Missing X-App-Code header",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Application not found",
      },
    },
  },
  handler: async (c) => {
    // biome-ignore lint/suspicious/noExplicitAny: defineOpenAPIRoute doesn't support env type inference
    const app = (c as any).get("currentApp");
    return c.json(app, 200);
  },
});
