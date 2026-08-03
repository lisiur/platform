"use client";

import { cn } from "@repo/ui";
import type { UIMessage } from "ai";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ChatComposer, useComposerState } from "./chat-composer";
import { ChatMessageList } from "./chat-message-list";
import {
  getToolPartName,
  INTERACTION_TOOL_NAMES,
  isToolPart,
} from "./tool-card";

function hasPendingInteractionTool(messages: UIMessage[]): boolean {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role !== "assistant") return false;

  return lastMessage.parts.some(
    (part) =>
      isToolPart(part) &&
      INTERACTION_TOOL_NAMES.has(getToolPartName(part)) &&
      (part.state === "input-streaming" || part.state === "input-available"),
  );
}

export interface AgentChatProps {
  /** Messages from `useAgentChat().messages`. */
  messages: import("ai").UIMessage[];
  /** Send a prompt with optional staged files (uploaded lazily by the caller). */
  sendMessage: (text: string, files?: File[]) => void | Promise<void>;
  /** Submit output for a client-side interaction tool. */
  submitToolResult?: (
    toolCallId: string,
    output: unknown,
    toolName?: string,
  ) => void;
  status: "submitted" | "streaming" | "ready" | "error";
  /** True while session history is being rehydrated. */
  isLoadingHistory?: boolean;
  stop: () => void;
  error: Error | null;
  /** When true, show the reasoning panel (structured parts + `<think>` blocks). */
  showReasoning?: boolean;
  /** When true, show the generic fallback tool-call card. Interactive tool
   *  cards always render regardless. */
  showToolCalls?: boolean;
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
  submitToolResult,
  status,
  isLoadingHistory,
  stop,
  error,
  showReasoning,
  showToolCalls,
  placeholder,
  emptyState,
  header,
  className,
}: AgentChatProps) {
  const t = useTranslations("Agent");
  const pendingInteractionTool = hasPendingInteractionTool(messages);
  const busy = status === "submitted" || status === "streaming";
  const composerState = useComposerState(
    sendMessage,
    busy,
    pendingInteractionTool,
  );

  // Idle-empty: no messages, history rehydrated, idle, and no error. Excludes
  // the history-load window and in-flight/error states so the prompt only
  // centers when truly empty and doesn't bounce.
  const isEmpty =
    messages.length === 0 && !isLoadingHistory && status === "ready" && !error;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {header}
      {isEmpty ? (
        <div className="flex min-h-0 flex-1 animate-in fade-in-0 flex-col items-center justify-center py-8 duration-200">
          <div className="-translate-y-20 flex w-full flex-col items-center gap-6">
            <p className="animate-in fade-in-0 slide-in-from-bottom-2 text-center text-sm text-muted-foreground duration-200">
              {emptyState ?? t("chatEmpty")}
            </p>
            <div className="w-full animate-in fade-in-0 slide-in-from-bottom-3 duration-200">
              <ChatComposer
                state={composerState}
                onStop={stop}
                placeholder={placeholder}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          <ChatMessageList
            messages={messages}
            status={status}
            isLoadingHistory={isLoadingHistory}
            emptyState={emptyState}
            submitToolResult={submitToolResult}
            showReasoning={showReasoning}
            showToolCalls={showToolCalls}
          />
          {error ? (
            <div className="shrink-0 border-t border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error.message || "Something went wrong."}
            </div>
          ) : null}
          <ChatComposer
            state={composerState}
            onStop={stop}
            placeholder={placeholder}
          />
        </>
      )}
    </div>
  );
}
