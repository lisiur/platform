import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listAiKeys as listAiKeysService } from "#modules/ai/ai-key.service";
import { listAiKeysQuerySchema, listAiKeysResponseSchema } from "./schema";

export const listAiKeysRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listAiKeys",
    method: "get",
    path: "/",
    tags: ["AI"],
    summary: "List AI keys",
    request: { query: listAiKeysQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(listAiKeysResponseSchema, "Paginated list of AI keys"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-key:list");
    const { search, accountId, limit, offset } = c.req.valid("query");
    const result = await listAiKeysService({
      search,
      accountId,
      limit,
      offset,
    });
    return c.json(result, 200);
  },
});
