"use client";

import { cn, Spinner } from "@repo/ui";
import type { UIMessage } from "ai";
import { Fragment, type ReactNode } from "react";
import { AgentMarkdown } from "./agent-comark";
import { isReasoningPart, ReasoningPartItem } from "./reasoning-part-item";
import { isToolPart, ToolCard } from "./tool-card";

interface ChatMessageListProps {
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  isLoadingHistory?: boolean;
  emptyState?: ReactNode;
}

/** Stable key for a message part. Uses `toolCallId` when available; otherwise
 * falls back to the part index. Message parts are append-only, so the index is
 * stable across re-renders. Content-based keys must NOT be used for streaming
 * text parts — the content changes on every token delta, which would unmount
 * and remount the markdown renderer and break incremental streaming. */
function partKey(
  part: {
    type: string;
    toolCallId?: string;
  },
  index: number,
): string {
  if (part.toolCallId) {
    return `${part.type}:${part.toolCallId}`;
  }
  return `${part.type}:${index}`;
}

function isLastAssistantText(
  messages: UIMessage[],
  message: UIMessage,
  partIndex: number,
  part: { type: string },
): boolean {
  if (message.role !== "assistant" || part.type !== "text") return false;
  const isLastMessage = messages[messages.length - 1]?.id === message.id;
  if (!isLastMessage) return false;
  const laterNonText = message.parts
    .slice(partIndex + 1)
    .some((p) => p.type === "text");
  return !laterNonText;
}

export function ChatMessageList({
  messages,
  status,
  isLoadingHistory,
  emptyState,
}: ChatMessageListProps) {
  const pending = status === "submitted" || status === "streaming";

  if (messages.length === 0) {
    if (pending || isLoadingHistory) {
      return (
        <div className="flex flex-1 items-center justify-center p-8">
          <Spinner />
        </div>
      );
    }
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        {emptyState ?? "Ask the agent anything about the platform."}
      </div>
    );
  }

  const streaming = status === "streaming";

  const lastMessage = messages[messages.length - 1];
  const hasAssistantContent =
    lastMessage?.role === "assistant" && lastMessage.parts.length > 0;
  const showSpinner = pending && !hasAssistantContent;

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {messages
        .filter((m) => m.parts.length > 0)
        .map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex",
              message.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "space-y-2 rounded-lg px-4 py-2 text-sm",
                message.role === "user"
                  ? "max-w-[85%] bg-primary text-primary-foreground"
                  : "bg-muted",
              )}
            >
              {message.parts.map((part, index) => {
                if (part.type === "text") {
                  if (message.role === "user") {
                    return (
                      <Fragment key={partKey(part, index)}>
                        <p className="whitespace-pre-wrap break-words">
                          {part.text}
                        </p>
                      </Fragment>
                    );
                  }
                  return (
                    <div
                      key={partKey(part, index)}
                      className="typeset typeset-docs break-words"
                    >
                      <AgentMarkdown
                        content={part.text}
                        streaming={
                          streaming &&
                          isLastAssistantText(messages, message, index, part)
                        }
                      />
                    </div>
                  );
                }

                if (isReasoningPart(part)) {
                  return (
                    <ReasoningPartItem key={partKey(part, index)} part={part} />
                  );
                }

                if (isToolPart(part)) {
                  return (
                    <ToolCard
                      key={part.type + (part.toolCallId ?? index)}
                      part={part}
                    />
                  );
                }

                return null;
              })}
            </div>
          </div>
        ))}
      {showSpinner && (
        <div className="flex justify-start">
          <div className="rounded-lg bg-muted px-4 py-2">
            <Spinner />
          </div>
        </div>
      )}
    </div>
  );
}
