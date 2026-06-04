import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireSession } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { getUserAppMenus } from "#services/user-role.service";
import { mineMenusResponseSchema } from "./schema";

export const getUserAppRoles = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/mine",
    tags: ["UserRole"],
    summary: "Get current user's menus from all app-scoped roles",
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(
        mineMenusResponseSchema,
        "User's authorized menus across all applications",
      ),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);

    if (!session?.user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const menus = await getUserAppMenus(session.user.id);
    return c.json({ menus }, 200);
  },
});
