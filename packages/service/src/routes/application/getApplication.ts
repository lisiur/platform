import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import {
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { requirePermission } from "#middleware/require-permission";
import { getApplicationById } from "#services/application.service";
import { prepend } from "#utils/list";
import { applicationIdParamSchema, applicationSchema } from "./schema";

export const getApplication = defineOpenAPIRoute({
  route: createRoute({
    middleware: prepend([], requirePermission("application::view")),
    method: "get",
    path: "/{id}",
    tags: ["Application"],
    summary: "Get an application",
    description: "Returns a single application by ID.",
    request: {
      params: applicationIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,

      ...forbiddenResponse,
      ...okResponseFn(applicationSchema, "The application"),
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const app = await getApplicationById(id);
    return c.json(app, 200);
  },
});
