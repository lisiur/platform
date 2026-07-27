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
  .openapi("AgentSessionSummary");

export const sessionListResponseSchema = z
  .object({
    sessions: z.array(sessionSummarySchema),
    total: z.number(),
  })
  .openapi("AgentSessionList");

/**
 * History is returned as a permissive array: each entry is an AI SDK UIMessage
 * (id, role, parts). The consuming `useChat` treats these as UIMessage[].
 */
export const sessionHistoryResponseSchema = z
  .array(z.any())
  .openapi("AgentSessionHistory");
