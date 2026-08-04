import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireAppId } from "#extractors/current-app";
import {
  getPrincipalUserId,
  principalScope,
  requirePrincipal,
} from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { getMenusForUser } from "#modules/access-control/public";
import { mineMenusResponseSchema } from "./schema";

export const getMine = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getMine",
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
    const principal = await requirePrincipal(c);

    if (!getPrincipalUserId(principal)) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const appId = await requireAppId(c);
    const scope = principalScope(principal);
    const menus = await getMenusForUser(
      getPrincipalUserId(principal),
      appId,
      scope,
    );
    return c.json({ menus }, 200);
  },
});
