import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { okResponseFn, unauthorizedResponse } from "#lib/openapi";
import { normalizeSeedLocale } from "../../domain";
import { ensureDefaultLedger, listLedgers } from "../../ledger.service";
import { listLedgersResponseSchema } from "./schema";

export const listLedgersRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listQianlaiLedgers",
    method: "get",
    path: "/ledgers",
    tags: ["QianlaiLedger"],
    summary: "List my ledgers",
    description:
      "Returns ledgers the caller owns or is a member of. Lazily provisions the default ledger (with a localized starter chart of accounts) on first call.",
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
    const locale = normalizeSeedLocale(c.req.header("accept-language"));
    await ensureDefaultLedger(userId, locale);
    const result = await listLedgers(userId);
    return c.json(result, 200);
  },
});
