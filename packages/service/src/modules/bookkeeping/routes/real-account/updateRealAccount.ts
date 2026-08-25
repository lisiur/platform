import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { updateRealAccount } from "../../real-account.service";
import {
  realAccountIdParamSchema,
  realAccountSchema,
  serializeRealAccount,
  updateRealAccountBodySchema,
} from "./schema";

export const updateRealAccountRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "updateQianlaiRealAccount",
    method: "patch",
    path: "/real-accounts/{id}",
    tags: ["QianlaiRealAccount"],
    summary: "Update one of the caller's real accounts",
    description:
      'Use status "archived" to retire a closed card: it stays listed but drops out of the totals.',
    request: {
      params: realAccountIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updateRealAccountBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...conflictResponse,
      ...okResponseFn(realAccountSchema, "The updated real account"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const account = await updateRealAccount(userId, id, body);
    return c.json(serializeRealAccount(account), 200);
  },
});
