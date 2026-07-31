import { randomUUID } from "node:crypto";
import type { UIMessage } from "ai";
import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
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

export type AgentToolResultInput =
  | {
      toolCallId: string;
      output: unknown;
    }
  | {
      toolCallId: string;
      errorText: string;
    };

type MutableToolPart = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  [key: string]: unknown;
};

function asJson(parts: UIMessage["parts"]): Prisma.InputJsonValue {
  return parts as unknown as Prisma.InputJsonValue;
}

function isToolPart(part: unknown): part is MutableToolPart {
  if (typeof part !== "object" || part === null) return false;
  const type = (part as { type?: string }).type ?? "";
  return type.startsWith("tool-") || type === "dynamic-tool";
}

function toolName(part: MutableToolPart): string {
  return (
    part.toolName ??
    (part.type.startsWith("tool-") ? part.type.slice("tool-".length) : "")
  );
}

function selectedIdsFromOutput(output: unknown): string[] | null {
  if (typeof output !== "object" || output === null) return null;
  const selectedIds = (output as { selectedIds?: unknown }).selectedIds;
  if (!Array.isArray(selectedIds)) return null;
  if (!selectedIds.every((id): id is string => typeof id === "string")) {
    return null;
  }
  return selectedIds;
}

function validateChooseOptionOutput(
  part: MutableToolPart,
  output: unknown,
): void {
  const input = part.input;
  if (typeof input !== "object" || input === null) {
    throw new HTTPException(400, { message: "Invalid choose_option input." });
  }

  const rawOptions = (input as { options?: unknown }).options;
  if (!Array.isArray(rawOptions)) {
    throw new HTTPException(400, { message: "Invalid choose_option options." });
  }

  const optionIds = new Set<string>();
  for (const option of rawOptions) {
    if (typeof option !== "object" || option === null) continue;
    const id = (option as { id?: unknown }).id;
    if (typeof id === "string") optionIds.add(id);
  }

  const selectedIds = selectedIdsFromOutput(output);
  if (!selectedIds || selectedIds.length === 0) {
    throw new HTTPException(400, {
      message: "choose_option output must include selectedIds.",
    });
  }

  const multiple = (input as { multiple?: unknown }).multiple === true;
  if (!multiple && selectedIds.length !== 1) {
    throw new HTTPException(400, {
      message: "choose_option accepts exactly one selected id.",
    });
  }

  for (const id of selectedIds) {
    if (!optionIds.has(id)) {
      throw new HTTPException(400, {
        message: `Unknown choose_option selected id: ${id}`,
      });
    }
  }
}

function valuesFromFormOutput(output: unknown): Record<string, unknown> | null {
  if (typeof output !== "object" || output === null) return null;
  const values = (output as { values?: unknown }).values;
  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    return null;
  }
  return values as Record<string, unknown>;
}

function validateRenderFormOutput(
  part: MutableToolPart,
  output: unknown,
): void {
  const input = part.input;
  if (typeof input !== "object" || input === null) {
    throw new HTTPException(400, { message: "Invalid render_form input." });
  }

  const rawFields = (input as { fields?: unknown }).fields;
  if (!Array.isArray(rawFields)) {
    throw new HTTPException(400, { message: "Invalid render_form fields." });
  }

  const values = valuesFromFormOutput(output);
  if (!values) {
    throw new HTTPException(400, {
      message: "render_form output must include values.",
    });
  }

  const fields = rawFields.flatMap(
    (field): Array<{ name: string; required: boolean; type: string }> => {
      if (typeof field !== "object" || field === null) return [];
      const name = (field as { name?: unknown }).name;
      const type = (field as { type?: unknown }).type;
      if (typeof name !== "string" || typeof type !== "string") return [];
      return [
        {
          name,
          required: (field as { required?: unknown }).required === true,
          type,
        },
      ];
    },
  );
  const fieldNames = new Set(fields.map((field) => field.name));

  for (const name of Object.keys(values)) {
    if (!fieldNames.has(name)) {
      throw new HTTPException(400, {
        message: `Unknown render_form field: ${name}`,
      });
    }
  }

  for (const field of fields) {
    if (!field.required) continue;
    const value = values[field.name];
    if (field.type === "boolean") continue;
    if (value === undefined || value === null || String(value).trim() === "") {
      throw new HTTPException(400, {
        message: `render_form field is required: ${field.name}`,
      });
    }
  }
}

class AgentSessionManager {
  async createSession(userId: string, appId: string): Promise<string> {
    const config = await loadAiAgentConfig(appId);
    if (!isAgentConfigured(config)) {
      throw new AgentConfigError(
        "AI Agent is not configured. Set the base URL, API key, and model under the application's General tab → AI Agent.",
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

  async applyToolResults(
    sessionId: string,
    results: AgentToolResultInput[],
  ): Promise<void> {
    try {
      await prisma.$transaction(
        async (tx) => {
          const rows = await tx.agentMessage.findMany({
            where: { sessionId, role: "assistant" },
            orderBy: { createdAt: "asc" },
            select: { id: true, parts: true },
          });

          const updates = new Map<string, UIMessage["parts"]>();

          for (const result of results) {
            let matched = false;

            for (const row of rows) {
              const currentParts =
                updates.get(row.id) ?? (row.parts as UIMessage["parts"]);
              const nextParts = currentParts.map((part) => {
                if (matched || !isToolPart(part)) return part;
                if (part.toolCallId !== result.toolCallId) return part;

                matched = true;

                const name = toolName(part);
                if (name !== "choose_option" && name !== "render_form") {
                  throw new HTTPException(400, {
                    message: "Unsupported interactive tool result.",
                  });
                }

                if (
                  part.state === "output-available" ||
                  part.state === "output-error" ||
                  part.state === "output-denied"
                ) {
                  throw new HTTPException(409, {
                    message: "Tool result has already been submitted.",
                  });
                }

                if ("errorText" in result) {
                  return {
                    ...part,
                    state: "output-error",
                    errorText: result.errorText,
                  };
                }

                if (name === "choose_option") {
                  validateChooseOptionOutput(part, result.output);
                } else {
                  validateRenderFormOutput(part, result.output);
                }
                return {
                  ...part,
                  state: "output-available",
                  output: result.output,
                };
              });

              if (matched) {
                updates.set(row.id, nextParts as UIMessage["parts"]);
                break;
              }
            }

            if (!matched) {
              throw new HTTPException(400, {
                message: `Unknown toolCallId: ${result.toolCallId}`,
              });
            }
          }

          for (const [messageId, parts] of updates) {
            await tx.agentMessage.update({
              where: { id: messageId },
              data: { parts: asJson(parts) },
            });
          }
        },
        { isolationLevel: "Serializable" },
      );
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code === "P2034"
      ) {
        throw new HTTPException(409, {
          message: "Tool result has already been submitted.",
        });
      }
      throw err;
    }
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
