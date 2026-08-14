import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listAiAccounts as listAiAccountsService } from "#modules/ai/ai-account.service";
import {
  listAiAccountsQuerySchema,
  listAiAccountsResponseSchema,
} from "./schema";

export const listAiAccountsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listAiAccounts",
    method: "get",
    path: "/",
    tags: ["AI"],
    summary: "List AI accounts",
    request: { query: listAiAccountsQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listAiAccountsResponseSchema,
        "Paginated list of AI accounts",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-account:list");
    const { search, providerId, limit, offset } = c.req.valid("query");
    const result = await listAiAccountsService({
      search,
      providerId,
      limit,
      offset,
    });
    return c.json(result, 200);
  },
});
