import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  conflictResponse,
  createdResponseFn,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { createRealAccount } from "../../real-account.service";
import {
  createRealAccountBodySchema,
  realAccountSchema,
  serializeRealAccount,
} from "./schema";

export const createRealAccountRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createQianlaiRealAccount",
    method: "post",
    path: "/real-accounts",
    tags: ["QianlaiRealAccount"],
    summary: "Create a real account (asset/liability master)",
    description:
      "Master records are private to their owner; link per-ledger book accounts to them via the account endpoints' realAccountId field.",
    request: {
      body: {
        content: {
          "application/json": { schema: createRealAccountBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...conflictResponse,
      ...createdResponseFn(realAccountSchema, "The created real account"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const body = c.req.valid("json");
    const account = await createRealAccount(userId, body);
    return c.json(serializeRealAccount(account), 201);
  },
});
