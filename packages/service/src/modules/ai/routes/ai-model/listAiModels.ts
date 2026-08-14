import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listAiModels as listAiModelsService } from "#modules/ai/ai-model.service";
import { listAiModelsQuerySchema, listAiModelsResponseSchema } from "./schema";

export const listAiModelsRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listAiModels",
    method: "get",
    path: "/",
    tags: ["AI"],
    summary: "List AI models",
    request: { query: listAiModelsQuerySchema },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        listAiModelsResponseSchema,
        "Paginated list of AI models",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-model:list");
    const { search, providerId, limit, offset } = c.req.valid("query");
    const result = await listAiModelsService({
      search,
      providerId,
      limit,
      offset,
    });
    return c.json(result, 200);
  },
});
