import { randomUUID } from "node:crypto";
import { prisma } from "#lib/db";
import {
  isAgentConfigured,
  loadAiAgentConfig,
} from "#services/agent-config.service";

export class AgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentConfigError";
  }
}

export class AgentSessionNotFoundError extends Error {
  constructor() {
    super("Agent session not found");
    this.name = "AgentSessionNotFoundError";
  }
}

export interface AgentSessionSummary {
  sessionId: string;
  name: string | null;
  createdAt: number;
}

export interface AgentSessionListResult {
  sessions: AgentSessionSummary[];
  total: number;
}

export interface AgentSessionListParams {
  limit: number;
  offset: number;
}

class AgentSessionManager {
  async createSession(userId: string): Promise<string> {
    const config = await loadAiAgentConfig();
    if (!isAgentConfigured(config)) {
      throw new AgentConfigError(
        "AI Agent is not configured. Set the base URL, API key, and model under Settings → AI Agent.",
      );
    }

    const sessionId = randomUUID();
    await prisma.agentSession.create({
      data: { id: sessionId, userId },
    });
    return sessionId;
  }

  async requireSession(sessionId: string, userId: string): Promise<void> {
    const row = await prisma.agentSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!row || row.userId !== userId) {
      throw new AgentSessionNotFoundError();
    }
  }

  async ensureSession(sessionId: string, userId: string): Promise<void> {
    const row = await prisma.agentSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!row) {
      try {
        await prisma.agentSession.create({
          data: { id: sessionId, userId },
        });
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          err.code === "P2002"
        ) {
          const existing = await prisma.agentSession.findUnique({
            where: { id: sessionId },
            select: { userId: true },
          });
          if (!existing || existing.userId !== userId) {
            throw new AgentSessionNotFoundError();
          }
        } else {
          throw err;
        }
      }
    } else if (row.userId !== userId) {
      throw new AgentSessionNotFoundError();
    }
  }

  async updateName(sessionId: string, name: string): Promise<void> {
    await prisma.agentSession.update({
      where: { id: sessionId },
      data: { name },
    });
  }

  async listByUser(
    userId: string,
    params: AgentSessionListParams,
  ): Promise<AgentSessionListResult> {
    const [rows, total] = await Promise.all([
      prisma.agentSession.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, createdAt: true },
        take: params.limit,
        skip: params.offset,
      }),
      prisma.agentSession.count({ where: { userId } }),
    ]);
    return {
      sessions: rows.map((r) => ({
        sessionId: r.id,
        name: r.name,
        createdAt: r.createdAt.getTime(),
      })),
      total,
    };
  }

  async dispose(sessionId: string, userId: string): Promise<boolean> {
    const row = await prisma.agentSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!row || row.userId !== userId) return false;
    await prisma.agentSession.delete({ where: { id: sessionId } });
    return true;
  }
}

export const agentSessionManager = new AgentSessionManager();
