import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  conflictResponse,
  deleteSuccessSchema,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { deleteRealAccount } from "../../real-account.service";
import { realAccountIdParamSchema } from "./schema";

export const deleteRealAccountRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "deleteQianlaiRealAccount",
    method: "delete",
    path: "/real-accounts/{id}",
    tags: ["QianlaiRealAccount"],
    summary: "Delete one of the caller's real accounts",
    description:
      "Refused while book accounts still link to it — unlink the pockets first (or archive the master instead).",
    request: {
      params: realAccountIdParamSchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...conflictResponse,
      ...okResponseFn(deleteSuccessSchema, "Deletion confirmed"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { id } = c.req.valid("param");
    return c.json(await deleteRealAccount(userId, id), 200);
  },
});
