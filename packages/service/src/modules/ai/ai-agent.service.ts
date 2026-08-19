import { AI_AGENT_STATUSES, AI_REASONING_LEVELS } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AiAgent, Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";

const reasoningSchema = z.enum(AI_REASONING_LEVELS);
const statusSchema = z.enum(AI_AGENT_STATUSES);
const subAgentSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
  modelId: z.string().trim().min(1),
  systemPrompt: z.string().nullable().optional(),
  reasoning: reasoningSchema.nullable().optional(),
  temperature: z.number().nullable().optional(),
  maxSteps: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
});
const subAgentsSchema = z.record(z.string(), subAgentSchema);

export type AiAgentSubAgents = z.infer<typeof subAgentsSchema>;
export type AiAgentInput = {
  code: string;
  name: string;
  description?: string | null;
  status?: string;
  subAgents: AiAgentSubAgents;
  allowedApis?: string[];
};

type AgentRow = AiAgent;

function assertSubAgentKeysUnchanged(
  current: z.infer<typeof subAgentsSchema>,
  next: z.infer<typeof subAgentsSchema>,
) {
  const currentKeys = Object.keys(current).sort();
  const nextKeys = Object.keys(next).sort();
  const unchanged =
    currentKeys.length === nextKeys.length &&
    currentKeys.every((key, index) => key === nextKeys[index]);
  if (!unchanged) {
    throw new HTTPException(400, {
      message: "Sub-agent keys cannot be changed.",
    });
  }
}

function serialize(agent: AgentRow) {
  const allowedApis: string[] = agent.allowedApis
    ? z.array(z.string()).parse(agent.allowedApis)
    : [];
  const subAgents = subAgentsSchema.parse(agent.subAgents);
  return {
    id: agent.id,
    code: agent.code,
    name: agent.name,
    description: agent.description,
    status: statusSchema.parse(agent.status),
    subAgents,
    allowedApis,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

export async function listAiAgents(params: {
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { search, limit = 10, offset = 0 } = params;
  const where: Prisma.AiAgentWhereInput = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ];
  }
  const [agents, total] = await Promise.all([
    prisma.aiAgent.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: limit,
      skip: offset,
    }),
    prisma.aiAgent.count({ where }),
  ]);
  return { agents: agents.map(serialize), total };
}

export async function getAiAgent(id: string) {
  const agent = await prisma.aiAgent.findUnique({
    where: { id },
  });
  if (!agent) {
    throw new HTTPException(404, { message: "AI agent not found" });
  }
  return serialize(agent);
}

export async function createAiAgent(data: AiAgentInput) {
  const existing = await prisma.aiAgent.findUnique({
    where: { code: data.code },
  });
  if (existing) {
    throw new HTTPException(409, { message: "Agent code already exists." });
  }
  const { subAgents, allowedApis, ...rest } = data;

  const agent = await prisma.aiAgent.create({
    data: {
      ...rest,
      subAgents,
      allowedApis: allowedApis ?? [],
    },
  });
  return serialize(agent);
}

export async function updateAiAgent(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    status?: string;
    subAgents?: z.infer<typeof subAgentsSchema>;
    allowedApis?: string[];
  },
) {
  const existing = await getAiAgent(id);
  const { subAgents, allowedApis, ...rest } = data;
  if (subAgents !== undefined) {
    assertSubAgentKeysUnchanged(existing.subAgents, subAgents);
  }

  const agent = await prisma.aiAgent.update({
    where: { id },
    data: {
      ...rest,
      ...(subAgents !== undefined ? { subAgents } : {}),
      ...(allowedApis !== undefined ? { allowedApis } : {}),
    },
  });
  return serialize(agent);
}

export async function deleteAiAgent(id: string) {
  await getAiAgent(id);
  const usage = await prisma.aiUsageEvent.count({ where: { agentId: id } });
  if (usage > 0) {
    throw new HTTPException(409, {
      message: "Cannot delete an agent that has usage history.",
    });
  }
  await prisma.aiAgent.delete({ where: { id } });
  return { success: true as const };
}
