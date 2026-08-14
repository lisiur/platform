import type { Context, ToolSet } from "@ai-sdk/provider-utils";
import type { AiReasoningLevel } from "@repo/shared";
import { type ModelMessage, stepCountIs, streamText } from "ai";
import { findOperation } from "#modules/agent/openapi.service";
import { createProviderModel, type ProviderEndpoint } from "./provider-adapter";
import {
  buildInteractionTools,
  buildTools,
  type ForwardedHeaders,
} from "./tools";

export function buildSystemPrompt(
  systemPrompt: string | null,
  openApiCatalogue: string[] = [],
): string | undefined {
  const lines: string[] = [];
  const trimmedSystemPrompt = systemPrompt?.trim();
  if (trimmedSystemPrompt) lines.push(trimmedSystemPrompt);

  if (openApiCatalogue.length > 0) {
    lines.push("", "Available API endpoints:", ...openApiCatalogue);
  }

  return lines.length > 0 ? lines.join("\n") : undefined;
}

export interface StreamAgentParams {
  endpoint: ProviderEndpoint;
  systemPrompt: string | null;
  reasoning: AiReasoningLevel | null;
  maxSteps: number;
  temperature: number | null;
  allowedApis: string[];
  messages: ModelMessage[];
  abortSignal: AbortSignal;
  apiOrigin?: string;
  sessionId?: string;
  forwardedHeaders?: ForwardedHeaders;
}

export async function streamAgent({
  endpoint,
  systemPrompt,
  reasoning,
  maxSteps,
  temperature,
  allowedApis,
  messages,
  abortSignal,
  apiOrigin,
  sessionId,
  forwardedHeaders,
}: StreamAgentParams): Promise<
  ReturnType<typeof streamText<ToolSet, Context>>
> {
  let catalogue: string[] = [];
  let tools: ToolSet = buildInteractionTools();

  if (apiOrigin && allowedApis.length > 0) {
    const resolved: Array<{
      operationId: string;
      found: NonNullable<Awaited<ReturnType<typeof findOperation>>>;
    }> = [];
    for (const operationId of allowedApis) {
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

  const model = createProviderModel(endpoint);

  return streamText({
    model,
    system: buildSystemPrompt(systemPrompt, catalogue),
    messages,
    tools,
    temperature: temperature ?? undefined,
    stopWhen: stepCountIs(maxSteps),
    abortSignal,
    reasoning: reasoning ?? undefined,
  });
}
