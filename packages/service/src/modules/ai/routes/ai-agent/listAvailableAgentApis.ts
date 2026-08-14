import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  serviceUnavailableResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertAccess } from "#modules/access-control/public";
import { listAvailableOperations } from "#modules/agent/openapi.service";
import { availableApiOperationSchema } from "./schema";

export const listAvailableAgentApisRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "listAvailableAgentApis",
    method: "get",
    path: "/available-apis",
    tags: ["AI"],
    summary: "List API operations available to AI agents",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...serviceUnavailableResponse,
      ...okResponseFn(
        availableApiOperationSchema.array(),
        "Available platform API operations",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    await assertAccess(principal, "system/ai-agent:update");
    try {
      const operations = await listAvailableOperations();
      return c.json(operations, 200);
    } catch (err) {
      throw new HTTPException(503, {
        message: `Failed to load OpenAPI spec: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },
});
