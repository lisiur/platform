"use client";

import { cn } from "@repo/ui";
import type { ReactNode } from "react";
import { ChatComposer } from "./chat-composer";
import { ChatMessageList } from "./chat-message-list";

export interface AgentChatProps {
  /** Messages from `useAgentChat().messages`. */
  messages: import("ai").UIMessage[];
  /** Send a prompt from `useAgentChat().sendMessage`. */
  sendMessage: (text: string) => void;
  status: "submitted" | "streaming" | "ready" | "error";
  stop: () => void;
  error: Error | null;
  /** Optional UI overrides. */
  placeholder?: string;
  emptyState?: ReactNode;
  header?: ReactNode;
  className?: string;
}

/**
 * Presentational AI Agent chat panel — render + send/stream only.
 *
 * Session lifecycle (create/list/select/delete) is owned by the consuming
 * application. Compose with the `useAgentChat` hook:
 *
 * ```tsx
 * const chat = useAgentChat({ sessionId, apiOrigin, appCode });
 * return <AgentChat {...chat} />;
 * ```
 */
export function AgentChat({
  messages,
  sendMessage,
  status,
  stop,
  error,
  placeholder,
  emptyState,
  header,
  className,
}: AgentChatProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {header}
      <ChatMessageList
        messages={messages}
        status={status}
        emptyState={emptyState}
      />
      {error ? (
        <div className="shrink-0 border-t border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error.message || "Something went wrong."}
        </div>
      ) : null}
      <ChatComposer
        status={status}
        onSend={sendMessage}
        onStop={stop}
        placeholder={placeholder}
      />
    </div>
  );
}
