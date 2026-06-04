import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireAppId } from "#extractors/app-id";
import { requireSession } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { getMenusForUser } from "#services/role-permission.service";
import { mineMenusResponseSchema } from "./schema";

export const getMine = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/mine",
    tags: ["Menu"],
    summary: "Get current user's authorized menus",
    description:
      "Returns menus authorized for the current user across all their app-scoped roles.",
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(
        mineMenusResponseSchema,
        "Menus authorized for the current user",
      ),
    },
  }),
  handler: async (c) => {
    const session = await requireSession(c);

    if (!session?.user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const appId = await requireAppId(c);
    const menus = await getMenusForUser(session.user.id, appId);
    return c.json({ menus }, 200);
  },
});
