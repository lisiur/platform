import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { auth } from "@/lib/auth";
import { userRoleRepository } from "@/repositories/user-role.repository";
import { errorSchema, mineMenusResponseSchema } from "./schema";

export const getUserAppRoles = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/mine",
    tags: ["UserRole"],
    summary: "Get current user's menus from all app-scoped roles",
    responses: {
      200: {
        content: {
          "application/json": { schema: mineMenusResponseSchema },
        },
        description: "User's authorized menus across all applications",
      },
      401: {
        content: { "application/json": { schema: errorSchema } },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const menus = await userRoleRepository.getMenusForUser(session.user.id);
    return c.json({ menus }, 200);
  },
});
