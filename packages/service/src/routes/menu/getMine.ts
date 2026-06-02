import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getSession } from "#services/auth.service";
import { getMenusForUser } from "#services/role-permission.service";
import { errorSchema, mineMenusResponseSchema } from "./schema";

export const getMine = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/mine",
    tags: ["Menu"],
    summary: "Get current user's authorized menus",
    description:
      "Returns menus authorized for the current user across all their app-scoped roles.",
    responses: {
      200: {
        content: {
          "application/json": { schema: mineMenusResponseSchema },
        },
        description: "Menus authorized for the current user",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const session = await getSession(c.req.raw.headers);

    if (!session?.user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const appId = c.get("appId");
    const menus = await getMenusForUser(session.user.id, appId);
    return c.json({ menus }, 200);
  },
});
