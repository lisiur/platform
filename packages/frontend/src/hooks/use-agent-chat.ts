"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { useEffect, useMemo, useRef, useState } from "react";

export interface UseAgentChatOptions {
  /** Active session id. When null, the hook is idle. */
  sessionId: string | null;
  /** API origin, e.g. window.location.origin. */
  apiOrigin: string;
  /** App code sent as the `X-App-Code` header. */
  appCode: string;
  /** Called when a request/stream fails. */
  onError?: (error: Error) => void;
  /**
   * Skip the initial history rehydration on mount (and on session change).
   * Use when the session is known to be empty and will be populated by an
   * immediate `sendMessage` (e.g. a freshly created session) — avoids a race
   * where the empty-history fetch resolves after the optimistic send and
   * wipes the in-flight messages.
   */
  skipInitialHistory?: boolean;
}

export interface AgentFileMeta {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface AgentChatApi {
  messages: UIMessage[];
  sendMessage: (text: string) => void;
  submitToolResult: (
    toolCallId: string,
    output: unknown,
    toolName?: string,
  ) => void;
  status: "submitted" | "streaming" | "ready" | "error";
  /** True while session history is being rehydrated (e.g. on session switch). */
  isLoadingHistory: boolean;
  stop: () => void;
  error: Error | null;
}

type AgentToolResultPayload =
  | {
      toolCallId: string;
      output: unknown;
    }
  | {
      toolCallId: string;
      errorText: string;
    };

type ToolPart = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  state?: string;
  output?: unknown;
  errorText?: string;
};

const INTERACTION_TOOL_NAMES = new Set(["choose_option", "render_form"]);

export async function uploadAgentFile(
  apiOrigin: string,
  sessionId: string,
  appCode: string,
  file: File,
): Promise<AgentFileMeta> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(
    `${apiOrigin}/api/agent/sessions/${sessionId}/files`,
    {
      method: "POST",
      body: fd,
      credentials: "include",
      headers: { "X-App-Code": appCode },
    },
  );
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as AgentFileMeta;
}

const FILE_ATTR_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeFileAttr(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => FILE_ATTR_ESCAPES[ch]);
}

export function augmentTextWithFiles(
  text: string,
  metas: AgentFileMeta[],
): string {
  const tags = metas
    .map(
      (m) =>
        `<uploaded-file fileId="${escapeFileAttr(m.fileId)}" filename="${escapeFileAttr(m.filename)}" mimeType="${escapeFileAttr(m.mimeType)}" size="${m.size}" />`,
    )
    .join("\n");
  return text ? `${text}\n${tags}` : tags;
}

function extractText(message: UIMessage | undefined): string {
  if (!message) return "";
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function isToolPart(part: unknown): part is ToolPart {
  if (typeof part !== "object" || part === null) return false;
  const type = (part as { type?: string }).type ?? "";
  return type.startsWith("tool-") || type === "dynamic-tool";
}

function getToolName(part: ToolPart): string {
  return (
    part.toolName ??
    (part.type.startsWith("tool-") ? part.type.slice("tool-".length) : "")
  );
}

function extractInteractionToolResults(
  message: UIMessage | undefined,
): AgentToolResultPayload[] {
  if (message?.role !== "assistant") return [];
  const results: AgentToolResultPayload[] = [];

  for (const part of message.parts) {
    if (!isToolPart(part)) continue;
    if (!part.toolCallId) continue;
    if (!INTERACTION_TOOL_NAMES.has(getToolName(part))) continue;
    if (part.state === "output-available") {
      results.push({ toolCallId: part.toolCallId, output: part.output });
    } else if (part.state === "output-error" && part.errorText) {
      results.push({ toolCallId: part.toolCallId, errorText: part.errorText });
    }
  }

  return results;
}

/**
 * Streaming wiring for a single pi.dev agent session. Encapsulates the AI SDK
 * `useChat` transport and history rehydration. Session lifecycle (create/list/
 * select/delete) is owned by the consuming application — this hook only handles
 * the chat interaction for the active session.
 */
export function useAgentChat({
  sessionId,
  apiOrigin,
  appCode,
  onError,
  skipInitialHistory = false,
}: UseAgentChatOptions): AgentChatApi {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  // Captured at mount and held for the life of this hook instance. ActiveChat
  // is keyed by `activeId`, so a session switch remounts the hook and
  // re-evaluates the flag. We intentionally do NOT reset this inside the
  // effect — doing so would break under React Strict Mode, where the mount
  // effect double-invokes and the second invoke would fetch empty history and
  // wipe an in-flight optimistic send.
  const skipHistoryRef = useRef(skipInitialHistory);

  const messagesApi = useMemo(
    () =>
      sessionId
        ? `${apiOrigin}/api/agent/sessions/${sessionId}/messages`
        : `${apiOrigin}/api/agent/invalid-session/messages`,
    [apiOrigin, sessionId],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: messagesApi,
        credentials: "include",
        headers: { "X-App-Code": appCode },
        // pi owns history; send only the new prompt text, except when AI SDK
        // auto-submits a completed client-side interaction tool result.
        prepareSendMessagesRequest: ({ messages }) => {
          const lastMessage = messages[messages.length - 1];
          const toolResults = extractInteractionToolResults(lastMessage);
          if (toolResults.length > 0) {
            return { body: { toolResults } };
          }

          const prompt = extractText(lastMessage);
          return { body: { prompt } };
        },
      }),
    [messagesApi, appCode],
  );

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError: (error) => {
      onErrorRef.current?.(error);
    },
  });

  // Keep setMessages stable across renders to avoid re-triggering the history fetch.
  const setMessagesRef = useRef(chat.setMessages);
  setMessagesRef.current = chat.setMessages;

  // True while a session's history is being fetched. Distinguished from
  // `status` (which reflects send/stream), so consumers can show a loading
  // state when switching into a session whose messages haven't arrived yet.
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Rehydrate history when switching sessions.
  useEffect(() => {
    if (!sessionId) {
      setMessagesRef.current([]);
      setIsLoadingHistory(false);
      return;
    }
    if (skipHistoryRef.current) {
      setIsLoadingHistory(false);
      return;
    }
    let cancelled = false;
    setIsLoadingHistory(true);
    fetch(`${apiOrigin}/api/agent/sessions/${sessionId}`, {
      credentials: "include",
      headers: { "X-App-Code": appCode },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((messages: UIMessage[]) => {
        if (!cancelled) {
          setMessagesRef.current(messages);
          setIsLoadingHistory(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessagesRef.current([]);
          setIsLoadingHistory(false);
          onErrorRef.current?.(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, apiOrigin, appCode]);

  return {
    messages: chat.messages,
    sendMessage: (text) => chat.sendMessage({ text }),
    submitToolResult: (toolCallId, output, toolName = "choose_option") =>
      chat.addToolOutput({
        tool: toolName,
        toolCallId,
        output,
      }),
    status: chat.status,
    isLoadingHistory,
    stop: chat.stop,
    error: chat.error ?? null,
  };
}
