import { type ToolSet, tool } from "ai";
import { z } from "zod";
import { findOperation } from "#services/openapi.service";
import type { CallApiContext } from "./call-api";

export function makeGetApiSchemaTool(ctx: CallApiContext): ToolSet[string] {
  return tool({
    description:
      "Get the full parameter and request body schema for an API endpoint. " +
      "Use this to inspect what path params, query params, and body structure " +
      "an endpoint expects BEFORE calling it with `call_api`. For multipart " +
      "endpoints, binary fields (format: binary) accept a fileId from the " +
      "upload file endpoint.",
    inputSchema: z.object({
      operationId: z
        .string()
        .describe("The operationId to inspect (e.g. 'createUser')"),
    }),
    execute: async (input) => {
      const { operationId } = input as { operationId: string };
      if (!ctx.allowedOperationIds.has(operationId)) {
        return {
          ok: false,
          status: 400,
          error: `Unknown operationId: "${operationId}"`,
        };
      }

      const found = await findOperation(operationId);
      if (!found) {
        return {
          ok: false,
          status: 400,
          error: `Operation "${operationId}" not found in the current OpenAPI spec`,
        };
      }

      const raw = found.raw as {
        parameters?: Array<{
          name: string;
          in: string;
          required?: boolean;
          schema?: Record<string, unknown>;
          description?: string;
        }>;
        requestBody?: Record<string, unknown>;
      };

      return {
        operationId,
        method: found.method,
        path: found.path,
        summary: found.operation.summary,
        parameters: raw.parameters ?? [],
        requestBody: raw.requestBody ?? null,
      };
    },
  }) satisfies ToolSet[string];
}
