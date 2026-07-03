import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireSession } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertPermission } from "#services/role-permission.service";
import { listUploads } from "#services/upload.service";
import { listUploadsQuerySchema, listUploadsResponseSchema } from "./schema";

export const listUploadsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["Upload"],
    summary: "List uploads",
    description:
      "Returns a paginated list of uploaded files with optional filters.",
    request: {
      query: listUploadsQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(listUploadsResponseSchema, "Paginated list of uploads"),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);
    await assertPermission(session.user.id, "upload::list");
    const query = c.req.valid("query");
    const result = await listUploads(query);
    return c.json(result, 200);
  },
});
