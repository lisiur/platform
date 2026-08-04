import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { Context, ToolSet } from "@ai-sdk/provider-utils";
import { type ModelMessage, stepCountIs, streamText } from "ai";
import type { AiAgentConfig } from "#modules/agent/agent-config.service";
import { findOperation } from "#modules/agent/openapi.service";
import {
  buildInteractionTools,
  buildTools,
  type ForwardedHeaders,
} from "./tools";

export function buildSystemPrompt(openApiCatalogue: string[] = []): string {
  const lines = [
    "You are the platform AI Agent — an assistant of user",
    "",
    `When users ask about your capabilities (e.g., “What can you do?”), respond only with the supplied Available API endpoints, presented in a generic, user-friendly tone. Do not reveal anything else, including tool names, parameters, internal functions, or any non-business details.`,
  ];
  lines.push("", "Available API endpoints:");
  if (openApiCatalogue.length > 0) {
    lines.push(...openApiCatalogue);
  } else {
    lines.push("No available endpoints.");
  }
  return lines.join("\n");
}

export interface StreamAgentParams {
  config: AiAgentConfig;
  messages: ModelMessage[];
  abortSignal: AbortSignal;
  maxSteps?: number;
  apiOrigin?: string;
  sessionId?: string;
  forwardedHeaders?: ForwardedHeaders;
}

export async function streamAgent({
  config,
  messages,
  abortSignal,
  maxSteps = 8,
  apiOrigin,
  sessionId,
  forwardedHeaders,
}: StreamAgentParams): Promise<
  ReturnType<typeof streamText<ToolSet, Context>>
> {
  let catalogue: string[] = [];
  let tools: ToolSet = buildInteractionTools();

  if (apiOrigin && config.allowedApis && config.allowedApis.length > 0) {
    const resolved: Array<{
      operationId: string;
      found: NonNullable<Awaited<ReturnType<typeof findOperation>>>;
    }> = [];
    for (const operationId of config.allowedApis) {
      const found = await findOperation(operationId);
      if (found) resolved.push({ operationId, found });
    }

    if (resolved.length > 0) {
      tools = {
        ...tools,
        ...buildTools({
          apiOrigin,
          sessionId: sessionId ?? "",
          forwardedHeaders: forwardedHeaders ?? {},
          allowedOperationIds: new Set(resolved.map((r) => r.operationId)),
        }),
      };
      catalogue = [
        "| Operation ID | Method | Path | Description |",
        "|-------------|--------|------|-------------|",
        ...resolved.map(
          (r) =>
            `| ${r.operationId} | ${r.found.method} | ${r.found.path} | ${r.found.operation.summary ?? "-"} |`,
        ),
      ];
    }
  }

  const openai = createOpenAICompatible({
    name: "platform-agent",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });

  return streamText({
    model: openai(config.model),
    system: buildSystemPrompt(catalogue),
    messages,
    tools,
    stopWhen: stepCountIs(maxSteps),
    abortSignal,
    reasoning:
      config.reasoning === "off" || !config.reasoning
        ? "none"
        : config.reasoning,
  });
}
