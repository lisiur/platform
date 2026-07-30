"use client";

import { Button, cn, Spinner } from "@repo/ui";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  augmentTextWithFiles,
  uploadAgentFile,
  useAgentChat,
} from "../../hooks/use-agent-chat";
import { useEventStream } from "../../hooks/use-event-stream";
import { toast } from "../../lib/toast";
import { AgentChat } from "../agent-chat/agent-chat";

export interface AgentSessionSummary {
  sessionId: string;
  name: string | null;
  createdAt: number;
}

/**
 * Session lifecycle surface used by {@link AgentPanel}. The consuming
 * application builds this from its typed `appClient` (resolving the Hono
 * responses to plain data and surfacing errors via `withApiFeedback`), keeping
 * the component decoupled from `@repo/service`.
 */
export interface AgentSessionsApi {
  list: (query: {
    limit: number;
    offset: number;
  }) => Promise<{ sessions: AgentSessionSummary[]; total: number }>;
  create: () => Promise<{ sessionId: string }>;
  delete: (id: string) => Promise<void>;
}

export interface AgentPanelProps {
  /** API origin, e.g. window.location.origin. */
  apiOrigin: string;
  /** App code sent as the `X-App-Code` header. */
  appCode: string;
  /** Session CRUD bound to the consuming app's `appClient`. */
  sessionsApi: AgentSessionsApi;
  /**
   * Extra classes for the panel root. The panel fills its parent's cross-axis
   * (`w-full`) and grows along the main axis only when the parent is a flex
   * container — pass `flex-1` (or constrain height) from the caller so the
   * layout is owned by the embedding surface (Sheet, page, etc.).
   */
  className?: string;
}

const PAGE_SIZE = 20;
const NEW_CHAT_ID = "__NEW__";

/**
 * Generic AI Agent panel: a session list plus the streaming chat, owning the
 * full session lifecycle (list/create/select/delete, lazy-load, and SSE title
 * updates). Display-mode agnostic — render it inside a Sheet, a full page, or
 * any sized flex parent. The parent must constrain width and height (e.g. by
 * passing `className="flex-1"` within a `flex flex-col` container).
 */
export function AgentPanel({
  apiOrigin,
  appCode,
  sessionsApi,
  className,
}: AgentPanelProps) {
  const t = useTranslations("Agent");

  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [_total, setTotal] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const data = await sessionsApi.list({ limit: PAGE_SIZE, offset });
        if (append) {
          setSessions((prev) => [...prev, ...data.sessions]);
        } else {
          setSessions(data.sessions);
        }
        setTotal(data.total);
        setHasMore(offset + data.sessions.length < data.total);
      } catch {
        if (!append) setSessions([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [sessionsApi],
  );

  // Load the first page on mount.
  useEffect(() => {
    void fetchPage(0, false);
  }, [fetchPage]);

  // Auto-select the most recent session once on initial load, or start a
  // new chat if no sessions exist yet.
  useEffect(() => {
    if (activeId) return;
    if (sessions.length > 0) {
      setActiveId(sessions[0].sessionId);
    } else if (!loading) {
      setActiveId(NEW_CHAT_ID);
    }
  }, [sessions, activeId, loading]);

  // IntersectionObserver for scroll-to-bottom lazy loading.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          void fetchPage(sessions.length, true);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, sessions.length, fetchPage]);

  useEventStream({
    origin: apiOrigin,
    appCode,
    event: "agent.session.title.updated",
    handler: useCallback((e: globalThis.MessageEvent) => {
      const data = JSON.parse(e.data) as {
        sessionId: string;
        name: string;
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.sessionId === data.sessionId ? { ...s, name: data.name } : s,
        ),
      );
    }, []),
  });

  function handleNewChat() {
    setActiveId(NEW_CHAT_ID);
    setPendingPrompt(null);
  }

  function handleSelectSession(sessionId: string) {
    setActiveId(sessionId);
    setPendingPrompt(null);
  }

  const createSession = useCallback(async (): Promise<string> => {
    const data = await sessionsApi.create();
    return data.sessionId;
  }, [sessionsApi]);

  const deleteSession = useCallback(
    async (sessionId: string): Promise<void> => {
      await sessionsApi.delete(sessionId);
    },
    [sessionsApi],
  );

  const activateSession = useCallback(
    (sessionId: string, prompt: string | null) => {
      setPendingPrompt(prompt);
      setActiveId(sessionId);
    },
    [],
  );

  const onFirstMessage = useCallback((sessionId: string) => {
    setSessions((prev) => {
      if (prev.some((s) => s.sessionId === sessionId)) return prev;
      return [{ sessionId, name: null, createdAt: Date.now() }, ...prev];
    });
    setTotal((prev) => prev + 1);
  }, []);

  async function handleDelete(sessionId: string) {
    try {
      await sessionsApi.delete(sessionId);
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      setTotal((prev) => prev - 1);
      setActiveId((curr) => (curr === sessionId ? null : curr));
    } catch {
      // Error surfaced by the consuming app's `withApiFeedback` wrapper.
    }
  }

  return (
    <div className={cn("flex min-h-0 w-full", className)}>
      {/* Session sidebar — app-owned session lifecycle */}
      <aside className="flex w-44 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border p-2">
          <span className="text-xs font-medium">{t("sessions")}</span>
          <Button
            size="icon-xs"
            variant="outline"
            onClick={handleNewChat}
            aria-label={t("newChat")}
          >
            <Plus />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {loading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-2 py-4 text-center text-muted-foreground text-xs">
              {t("empty")}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {sessions.map((s) => (
                <li key={s.sessionId}>
                  <button
                    type="button"
                    onClick={() => handleSelectSession(s.sessionId)}
                    className={`group flex w-full items-center gap-1 rounded-md px-1.5 py-1.5 text-left text-xs transition-colors ${
                      s.sessionId === activeId
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <span className="flex-1 truncate">
                      {s.name ?? t("untitled")}
                    </span>
                    <Trash2
                      role="button"
                      tabIndex={0}
                      aria-label={t("deleteChat")}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(s.sessionId);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDelete(s.sessionId);
                        }
                      }}
                      className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    />
                  </button>
                </li>
              ))}
              {/* Sentinel for IntersectionObserver */}
              <li>
                <div ref={sentinelRef} className="h-1" />
              </li>
              {loadingMore && (
                <li className="flex justify-center py-2">
                  <Spinner />
                </li>
              )}
            </ul>
          )}
        </div>
      </aside>

      {/* Chat panel — shared presentational component */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {activeId ? (
          <ActiveChat
            key={activeId}
            sessionId={activeId}
            apiOrigin={apiOrigin}
            appCode={appCode}
            title={
              sessions.find((s) => s.sessionId === activeId)?.name ??
              t("untitled")
            }
            placeholder={t("placeholder")}
            onFirstMessage={onFirstMessage}
            pendingPrompt={pendingPrompt}
            createSession={createSession}
            activateSession={activateSession}
            deleteSession={deleteSession}
            onPendingPromptConsumed={() => setPendingPrompt(null)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground text-xs">
            {t("empty")}
          </div>
        )}
      </section>
    </div>
  );
}

function ActiveChat({
  sessionId,
  apiOrigin,
  appCode,
  title,
  placeholder,
  onFirstMessage,
  pendingPrompt,
  createSession,
  activateSession,
  deleteSession,
  onPendingPromptConsumed,
}: {
  sessionId: string;
  apiOrigin: string;
  appCode: string;
  title: string;
  placeholder: string;
  onFirstMessage: (sessionId: string) => void;
  pendingPrompt: string | null;
  createSession: () => Promise<string>;
  activateSession: (sessionId: string, prompt: string | null) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  onPendingPromptConsumed: () => void;
}) {
  const isNew = sessionId === NEW_CHAT_ID;
  const chat = useAgentChat({
    sessionId: isNew ? null : sessionId,
    apiOrigin,
    appCode,
    // A pending prompt means this session was just created and is about to
    // receive its first message — skip the (empty) history fetch so it can't
    // race the optimistic send and wipe the in-flight user message.
    skipInitialHistory: !!pendingPrompt,
  });
  const firstMessageRef = useRef(false);

  useEffect(() => {
    if (!firstMessageRef.current && chat.messages.length > 0) {
      firstMessageRef.current = true;
      onFirstMessage(sessionId);
    }
  }, [chat.messages.length, sessionId, onFirstMessage]);

  const autoSentRef = useRef(false);
  useEffect(() => {
    if (!isNew && pendingPrompt && !autoSentRef.current) {
      autoSentRef.current = true;
      chat.sendMessage(pendingPrompt);
      onPendingPromptConsumed();
    }
  }, [isNew, pendingPrompt, chat, onPendingPromptConsumed]);

  async function handleSend(text: string, files: File[] = []) {
    if (isNew) {
      const newSessionId = await createSession();
      if (files.length > 0) {
        try {
          const metas = await Promise.all(
            files.map((f) =>
              uploadAgentFile(apiOrigin, newSessionId, appCode, f),
            ),
          );
          activateSession(newSessionId, augmentTextWithFiles(text, metas));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : String(err));
          await deleteSession(newSessionId).catch(() => {});
          throw err;
        }
        return;
      }
      activateSession(newSessionId, text);
      return;
    }

    let fullText = text;
    if (files.length > 0) {
      try {
        const metas = await Promise.all(
          files.map((f) => uploadAgentFile(apiOrigin, sessionId, appCode, f)),
        );
        fullText = augmentTextWithFiles(text, metas);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        throw err;
      }
    }

    chat.sendMessage(fullText);
  }

  return (
    <AgentChat
      messages={chat.messages}
      sendMessage={handleSend}
      status={chat.status}
      isLoadingHistory={chat.isLoadingHistory}
      stop={chat.stop}
      error={chat.error}
      placeholder={placeholder}
      header={
        <div className="flex shrink-0 items-center border-b border-border px-3 py-2.5 pr-12">
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
      }
    />
  );
}
