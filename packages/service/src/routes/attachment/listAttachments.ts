import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { listAttachments } from "#services/attachment.service";
import { assertAccess } from "#services/role-permission.service";
import {
  listAttachmentsQuerySchema,
  listAttachmentsResponseSchema,
} from "./schema";

export const listAttachmentsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["Attachment"],
    summary: "List attachments",
    description:
      "Returns a paginated list of file attachments with optional filters.",
    request: {
      query: listAttachmentsQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listAttachmentsResponseSchema,
        "Paginated list of attachments",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/attachment:list");
    const query = c.req.valid("query");
    const result = await listAttachments(query);
    return c.json(result, 200);
  },
});
