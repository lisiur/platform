import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAppId } from "#extractors/current-app";
import { requirePrincipal } from "#extractors/session";
import {
  forbiddenResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { loadAiAgentUiConfig } from "#modules/agent/agent-config.service";
import { agentConfigResponseSchema } from "./schema";

export const getConfigRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "getAgentConfig",
    method: "get",
    path: "/config",
    tags: ["Agent"],
    summary: "Get the resolved AI Agent visual config for the calling app",
    description:
      "Returns the app's AI Agent visual settings the client needs to render " +
      "the chat: which UI parts to show (reasoning panel, tool-call cards). " +
      "These are independent from the functional reasoning level, which is " +
      "resolved server-side only. Both flags default to true.",
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...okResponseFn(
        agentConfigResponseSchema,
        "Resolved agent visual config",
      ),
    },
  }),
  handler: async (c) => {
    await requirePrincipal(c);
    const appId = await requireAppId(c);
    const ui = await loadAiAgentUiConfig(appId);
    return c.json(ui, 200);
  },
});
