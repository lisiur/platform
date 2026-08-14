import { z } from "@hono/zod-openapi";
import { paginationQuerySchema } from "#lib/openapi";

export const sessionIdParamSchema = z.object({
  id: z.string().openapi({ example: "00000000-0000-4000-8000-000000000000" }),
});

export const listSessionsQuerySchema = paginationQuerySchema;

export const createSessionResponseSchema = z
  .object({
    sessionId: z
      .string()
      .openapi({ example: "00000000-0000-4000-8000-000000000000" }),
  })
  .openapi("AgentCreateSessionResult");

export const sessionSummarySchema = z
  .object({
    sessionId: z
      .string()
      .openapi({ example: "00000000-0000-4000-8000-000000000000" }),
    name: z
      .string()
      .nullable()
      .openapi({ example: "Deploy pipeline debugging" }),
    createdAt: z.number().int().openapi({ example: 1753324800000 }),
  })
  .openapi("AiConversationSummary");

export const sessionListResponseSchema = z
  .object({
    sessions: z.array(sessionSummarySchema),
    total: z.number(),
  })
  .openapi("AiConversationList");

/**
 * History is returned as a permissive array: each entry is an AI SDK UIMessage
 * (id, role, parts). The consuming `useChat` treats these as UIMessage[].
 */
export const sessionHistoryResponseSchema = z
  .array(z.any())
  .openapi("AiConversationHistory");

/**
 * Visual AI Agent config surfaced to the client: which chat UI parts the user
 * sees. Independent from the functional reasoning level, which is resolved
 * server-side only. Both flags default to `true`.
 */
export const agentConfigResponseSchema = z
  .object({
    showReasoning: z.boolean().openapi({ example: true }),
    showToolCalls: z.boolean().openapi({ example: true }),
  })
  .openapi("AgentConfig");

export const uploadFileResponseSchema = z
  .object({
    fileId: z
      .string()
      .openapi({ example: "00000000-0000-4000-8000-000000000000" }),
    filename: z.string().openapi({ example: "logo.png" }),
    mimeType: z.string().openapi({ example: "image/png" }),
    size: z.number().int().openapi({ example: 45678 }),
  })
  .openapi("AgentUploadFileResult");
