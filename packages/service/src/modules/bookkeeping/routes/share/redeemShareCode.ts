import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  createdResponseFn,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { redeemShareCode } from "../../share.service";
import { redeemBodySchema, redeemResponseSchema } from "./schema";

export const redeemShareCodeRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "redeemQianlaiShareCode",
    method: "post",
    path: "/share-codes/redeem",
    tags: ["QianlaiShare"],
    summary: "Redeem a share code to join a ledger",
    request: {
      body: {
        content: {
          "application/json": { schema: redeemBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...createdResponseFn(redeemResponseSchema, "Joined the ledger"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { code } = c.req.valid("json");
    const result = await redeemShareCode(userId, code);
    return c.json({ ...result, role: result.role as "editor" | "viewer" }, 201);
  },
});
