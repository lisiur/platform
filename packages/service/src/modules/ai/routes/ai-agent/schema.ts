import { z } from "@hono/zod-openapi";
import { AI_AGENT_STATUSES, AI_REASONING_LEVELS } from "@repo/shared";
import { idParamSchema, paginationQuerySchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

export const reasoningLevelSchema = z.enum(AI_REASONING_LEVELS);

export const agentStatusSchema = z.enum(AI_AGENT_STATUSES);

export const subAgentSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
  modelId: z.string().min(1),
  systemPrompt: z.string().nullable().optional(),
  reasoning: reasoningLevelSchema.nullable().optional(),
  temperature: z.number().nullable().optional(),
  maxSteps: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
});

export const subAgentsSchema = z.record(z.string(), subAgentSchema);

export const aiAgentSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    code: z.string().openapi({ example: "platform_assistant" }),
    name: z.string().openapi({ example: "Platform Assistant" }),
    description: z.string().nullable(),
    status: agentStatusSchema,
    subAgents: subAgentsSchema,
    allowedApis: z.string().array(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("AiAgent");

export const availableApiOperationSchema = z
  .object({
    operationId: z.string(),
    method: z.string(),
    path: z.string(),
    summary: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    tags: z.string().array().optional(),
  })
  .openapi("AvailableApiOperation");

export const createAiAgentBodySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  status: agentStatusSchema.optional(),
  subAgents: subAgentsSchema,
  allowedApis: z.string().array().optional(),
});

export const updateAiAgentBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: agentStatusSchema.optional(),
  subAgents: subAgentsSchema.optional(),
  allowedApis: z.string().array().optional(),
});

export const listAiAgentsQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
});

export const aiAgentIdParamSchema = idParamSchema();

export const listAiAgentsResponseSchema = z
  .object({
    agents: aiAgentSchema.array(),
    total: z.number(),
  })
  .openapi("ListAiAgentsResponse");
