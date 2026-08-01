"use client";

import { cn, Spinner } from "@repo/ui";
import type { UIMessage } from "ai";
import { useTranslations } from "next-intl";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { AgentMarkdown } from "./agent-comark";
import { ChoiceCard } from "./interactive-components/choice-card";
import { FormCard } from "./interactive-components/form-card";
import { isReasoningPart, ReasoningPartItem } from "./reasoning-part-item";
import {
  getToolPartName,
  INTERACTION_TOOL_NAMES,
  isToolPart,
  ToolCard,
} from "./tool-card";
import { UploadedFileCard } from "./uploaded-file-card";

interface ChatMessageListProps {
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  isLoadingHistory?: boolean;
  emptyState?: ReactNode;
  submitToolResult?: (
    toolCallId: string,
    output: unknown,
    toolName?: string,
  ) => void;
  /** When true, show the reasoning panel (structured parts + `<think>`
   *  blocks). Hidden reasoning also stops counting as "visible" for the
   *  typing indicator after a tool call. */
  showReasoning?: boolean;
  /** When true, show the generic fallback tool-call card. Interactive tool
   *  cards always render regardless of this flag. */
  showToolCalls?: boolean;
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
  return partIndex === message.parts.length - 1;
}

function isCompletedToolPart(part: UIMessage["parts"][number]): boolean {
  return (
    isToolPart(part) &&
    (part.state === "output-available" ||
      part.state === "output-error" ||
      part.output !== undefined ||
      part.errorText !== undefined)
  );
}

function hasVisiblePart(
  part: UIMessage["parts"][number],
  showReasoning = true,
  showToolCalls = true,
): boolean {
  if (part.type === "text") {
    return ((part as { text?: string }).text ?? "").trim().length > 0;
  }
  if (isReasoningPart(part)) return showReasoning;
  if (isToolPart(part)) {
    const name = getToolPartName(part);
    // Interactive tools always render regardless of showToolCalls.
    if (name === "choose_option" || name === "render_form") return true;
    return showToolCalls;
  }
  return false;
}

function isAwaitingAssistantAfterTool(
  message: UIMessage | undefined,
  showReasoning = true,
  showToolCalls = true,
): boolean {
  if (message?.role !== "assistant") return false;

  for (let index = message.parts.length - 1; index >= 0; index--) {
    if (!isCompletedToolPart(message.parts[index])) continue;
    return !message.parts
      .slice(index + 1)
      .some((p) => hasVisiblePart(p, showReasoning, showToolCalls));
  }

  return false;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 rounded-full bg-muted-foreground/70 animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
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
  submitToolResult,
  showReasoning = true,
  showToolCalls = true,
}: ChatMessageListProps) {
  const t = useTranslations("Agent");
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
  // Only count parts that actually render. A hidden reasoning/tool-call part
  // arriving first would otherwise flip this true and hide the typing
  // indicator before any visible content exists — then a later part trips it
  // back on, producing a flash.
  const hasVisibleAssistantContent =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some((p) =>
      hasVisiblePart(p, showReasoning, showToolCalls),
    );
  // When tool cards are hidden, an in-progress tool would otherwise render
  // nothing — fall back to the typing indicator so the chat doesn't look
  // frozen while a hidden tool executes.
  const lastPart = lastMessage?.parts[lastMessage.parts.length - 1];
  const lastPartIsRunningTool =
    lastMessage?.role === "assistant" &&
    isToolPart(lastPart) &&
    !INTERACTION_TOOL_NAMES.has(getToolPartName(lastPart)) &&
    !isCompletedToolPart(lastPart);
  const showSpinner =
    pending &&
    (!hasVisibleAssistantContent ||
      isAwaitingAssistantAfterTool(lastMessage, showReasoning, showToolCalls) ||
      (!showToolCalls && lastPartIsRunningTool));

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 [scrollbar-gutter:stable]"
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
              {emptyState ?? t("chatEmpty")}
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
                    <div className="flex w-full max-w-[85%] flex-col items-end gap-2">
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
                        <div className="min-w-0 space-y-2 rounded-xl bg-muted px-4 py-3 text-sm">
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
                        "min-w-0 space-y-2 rounded-xl px-4 py-3 text-sm",
                        message.role === "user"
                          ? "max-w-[85%] bg-muted"
                          : "w-full",
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
                                showReasoning={showReasoning}
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
                          if (!showReasoning) return null;
                          return (
                            <ReasoningPartItem
                              key={partKey(part, index)}
                              part={part}
                            />
                          );
                        }

                        if (isToolPart(part)) {
                          const toolName = getToolPartName(part);
                          if (toolName === "choose_option") {
                            return (
                              <ChoiceCard
                                key={part.type + (part.toolCallId ?? index)}
                                part={part}
                                submitToolResult={submitToolResult}
                              />
                            );
                          }

                          if (toolName === "render_form") {
                            return (
                              <FormCard
                                key={part.type + (part.toolCallId ?? index)}
                                part={part}
                                submitToolResult={submitToolResult}
                              />
                            );
                          }

                          if (!showToolCalls) return null;
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
            <div className="flex justify-start pl-4">
              <div className="rounded-lg bg-muted px-4 py-2">
                <TypingDots />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
