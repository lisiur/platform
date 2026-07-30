"use client";

import { cn, Spinner } from "@repo/ui";
import type { UIMessage } from "ai";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { AgentMarkdown } from "./agent-comark";
import { isReasoningPart, ReasoningPartItem } from "./reasoning-part-item";
import { isToolPart, ToolCard } from "./tool-card";
import { UploadedFileCard } from "./uploaded-file-card";

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

const FILE_TAG_RE =
  /<uploaded-file\s+fileId="([^"]+)"\s+filename="([^"]+)"\s+mimeType="([^"]+)"\s+size="(\d+)"\s*\/>/g;

const FILE_ATTR_UNESCAPES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
};

function unescapeFileAttr(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot);/g, (m) => FILE_ATTR_UNESCAPES[m]);
}

interface ParsedTextSegment {
  type: "text";
  text: string;
}

interface ParsedFileSegment {
  type: "file";
  filename: string;
  mimeType: string;
  size: number;
}

type ParsedSegment = ParsedTextSegment | ParsedFileSegment;

function parseUserMessage(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const regex = new RegExp(FILE_TAG_RE.source, FILE_TAG_RE.flags);
  let lastIndex = 0;
  let match = regex.exec(text);

  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        text: text.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: "file",
      filename: unescapeFileAttr(match[2]),
      mimeType: unescapeFileAttr(match[3]),
      size: Number(match[4]),
    });
    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }

  return segments;
}

function extractFileSegments(message: UIMessage): ParsedFileSegment[] {
  const files: ParsedFileSegment[] = [];
  for (const part of message.parts) {
    if (part.type === "text") {
      for (const seg of parseUserMessage(part.text)) {
        if (seg.type === "file") files.push(seg);
      }
    }
  }
  return files;
}

function stripFileTags(text: string): string {
  return text.replace(FILE_TAG_RE, "").trim();
}

export function ChatMessageList({
  messages,
  status,
  isLoadingHistory,
  emptyState,
}: ChatMessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const pinToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !isAtBottomRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, []);

  const empty = messages.length === 0;

  // Pin on content-size changes, not on `messages` deltas. During streaming
  // the markdown reflows *after* the messages effect fires (incremental
  // parsing in ComarkClient), so scrollHeight read in a messages-keyed
  // effect is stale and leaves a gap. A ResizeObserver fires once layout
  // settles, yielding an accurate scrollHeight every time — token deltas,
  // markdown reflow, image loads, and the spinner are all covered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: contentRef binds to a different DOM node when empty flips, requiring re-binding
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => pinToBottom());
    ro.observe(content);
    return () => ro.disconnect();
  }, [pinToBottom, empty]);

  useEffect(() => {
    if (status === "submitted") {
      isAtBottomRef.current = true;
      pinToBottom();
    }
  }, [status, pinToBottom]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const threshold = 100;
    isAtBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold;
  }, []);

  const pending = status === "submitted" || status === "streaming";

  const streaming = status === "streaming";

  const lastMessage = messages[messages.length - 1];
  const hasAssistantContent =
    lastMessage?.role === "assistant" && lastMessage.parts.length > 0;
  const showSpinner = pending && !hasAssistantContent;

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4"
    >
      {empty ? (
        <div
          ref={contentRef}
          className="flex min-h-full items-center justify-center p-4"
        >
          {pending || isLoadingHistory ? (
            <Spinner />
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              {emptyState ?? "Ask the agent anything about the platform."}
            </p>
          )}
        </div>
      ) : (
        <div ref={contentRef} className="space-y-4">
          {messages
            .filter((m) => m.parts.length > 0)
            .map((message) => {
              const fileSegments =
                message.role === "user" ? extractFileSegments(message) : [];
              const hasFiles = fileSegments.length > 0;
              const textContent = hasFiles
                ? message.parts
                    .map((p) =>
                      p.type === "text" ? stripFileTags(p.text) : "",
                    )
                    .join("")
                    .trim()
                : null;

              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  {hasFiles ? (
                    <div className="flex w-full max-w-[85%] flex-col items-end gap-1">
                      <div className="flex flex-col gap-1">
                        {fileSegments.map((seg) => (
                          <UploadedFileCard
                            key={seg.filename}
                            filename={seg.filename}
                            mimeType={seg.mimeType}
                            size={seg.size}
                          />
                        ))}
                      </div>
                      {textContent ? (
                        <div className="min-w-0 space-y-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
                          {message.parts.map((part, index) => {
                            if (part.type === "text") {
                              const text = stripFileTags(part.text);
                              return text ? (
                                <p
                                  key={partKey(part, index)}
                                  className="whitespace-pre-wrap break-words"
                                >
                                  {text}
                                </p>
                              ) : null;
                            }
                            return null;
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "min-w-0 space-y-2 rounded-lg px-4 py-2 text-sm",
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
                                  isLastAssistantText(
                                    messages,
                                    message,
                                    index,
                                    part,
                                  )
                                }
                              />
                            </div>
                          );
                        }

                        if (isReasoningPart(part)) {
                          return (
                            <ReasoningPartItem
                              key={partKey(part, index)}
                              part={part}
                            />
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
                  )}
                </div>
              );
            })}
          {showSpinner && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-muted px-4 py-2">
                <Spinner />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
