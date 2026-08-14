import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listAiProviders as listAiProvidersService } from "#modules/ai/ai-provider.service";
import {
  listAiProvidersQuerySchema,
  listAiProvidersResponseSchema,
} from "./schema";

export const listAiProvidersRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listAiProviders",
    method: "get",
    path: "/",
    tags: ["AI"],
    summary: "List AI providers",
    description:
      "Returns a paginated list of AI providers with optional search.",
    request: {
      query: listAiProvidersQuerySchema,
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listAiProvidersResponseSchema,
        "Paginated list of AI providers",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-provider:list");
    const { search, limit, offset } = c.req.valid("query");
    const result = await listAiProvidersService({ search, limit, offset });
    return c.json(result, 200);
  },
});
