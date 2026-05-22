import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/middleware/require-admin";
import {
  deleteSuccessSchema,
  errorSchema,
  organizationIdParamSchema,
} from "./schema";

export const deleteOrganization = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Organization"],
    summary: "Delete an organization",
    description:
      "Delete an organization by ID. Cascades to members and invitations.",
    middleware: requireAdmin,
    request: {
      params: organizationIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: deleteSuccessSchema },
        },
        description: "Successfully deleted",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");

    const existing = await prisma.organization.findUnique({ where: { id } });
    if (!existing) {
      throw new HTTPException(404, { message: "Organization not found" });
    }

    await prisma.organization.delete({ where: { id } });

    return c.json({ success: true as const }, 200);
  },
});
