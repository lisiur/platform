"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef } from "react";

export interface UseAgentChatOptions {
  /** Active session id. When null, the hook is idle. */
  sessionId: string | null;
  /** API origin, e.g. window.location.origin. */
  apiOrigin: string;
  /** App code sent as the `X-App-Code` header. */
  appCode: string;
  /** Called when a request/stream fails. */
  onError?: (error: Error) => void;
}

export interface AgentChatApi {
  messages: UIMessage[];
  sendMessage: (text: string) => void;
  status: "submitted" | "streaming" | "ready" | "error";
  stop: () => void;
  error: Error | null;
}

function extractText(message: UIMessage | undefined): string {
  if (!message) return "";
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
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
}: UseAgentChatOptions): AgentChatApi {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

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
        // pi owns history; send only the new prompt text.
        prepareSendMessagesRequest: ({ messages }) => {
          const prompt = extractText(messages[messages.length - 1]);
          return { body: { prompt } };
        },
      }),
    [messagesApi, appCode],
  );

  const chat = useChat({
    transport,
    onError: (error) => {
      onErrorRef.current?.(error);
    },
  });

  // Keep setMessages stable across renders to avoid re-triggering the history fetch.
  const setMessagesRef = useRef(chat.setMessages);
  setMessagesRef.current = chat.setMessages;

  // Rehydrate history when switching sessions.
  useEffect(() => {
    if (!sessionId) {
      setMessagesRef.current([]);
      return;
    }
    let cancelled = false;
    fetch(`${apiOrigin}/api/agent/sessions/${sessionId}`, {
      credentials: "include",
      headers: { "X-App-Code": appCode },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((messages: UIMessage[]) => {
        if (!cancelled) setMessagesRef.current(messages);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessagesRef.current([]);
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
    status: chat.status,
    stop: chat.stop,
    error: chat.error ?? null,
  };
}
