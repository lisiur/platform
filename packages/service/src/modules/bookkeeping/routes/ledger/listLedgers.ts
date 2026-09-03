import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { listLedgers } from "../../ledger.service";
import { listLedgersResponseSchema } from "./schema";

export const listLedgersRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listQianlaiLedgers",
    method: "get",
    path: "/ledgers",
    tags: ["QianlaiLedger"],
    summary: "List my ledgers",
    description: "Returns ledgers the caller owns or is a member of.",
    request: {},
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(
        listLedgersResponseSchema,
        "Ledgers visible to the caller",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const result = await listLedgers(userId);
    return c.json(result, 200);
  },
});
