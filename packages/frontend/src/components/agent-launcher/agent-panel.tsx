"use client";

import { Button, cn, Spinner, useIsMobile } from "@repo/ui";
import { MessagesSquare, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  const isMobile = useIsMobile();
  const desktopSentinelRef = useRef<HTMLDivElement>(null);
  const mobileSentinelRef = useRef<HTMLDivElement>(null);

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
    const sentinel =
      isMobile && mobileSessionsOpen
        ? mobileSentinelRef.current
        : desktopSentinelRef.current;
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
  }, [
    hasMore,
    loading,
    loadingMore,
    sessions.length,
    fetchPage,
    isMobile,
    mobileSessionsOpen,
  ]);

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
    setMobileSessionsOpen(false);
  }

  function handleSelectSession(sessionId: string) {
    setActiveId(sessionId);
    setPendingPrompt(null);
    setMobileSessionsOpen(false);
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
    <div className={cn("relative flex min-h-0 w-full", className)}>
      {/* Session sidebar — app-owned session lifecycle */}
      <SessionSidebar
        activeId={activeId}
        className="hidden w-64 shrink-0 border-r border-border md:flex"
        loading={loading}
        loadingMore={loadingMore}
        onDelete={handleDelete}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        sentinelRef={desktopSentinelRef}
        sessions={sessions}
      />

      {mobileSessionsOpen ? (
        <div className="absolute inset-0 z-20 md:hidden">
          <button
            type="button"
            aria-label="Close sessions"
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setMobileSessionsOpen(false)}
          />
          <SessionSidebar
            activeId={activeId}
            className="absolute inset-y-0 left-0 z-10 flex w-[min(18rem,85vw)] border-r border-border bg-background shadow-xl"
            loading={loading}
            loadingMore={loadingMore}
            onClose={() => setMobileSessionsOpen(false)}
            onDelete={handleDelete}
            onNewChat={handleNewChat}
            onSelectSession={handleSelectSession}
            sentinelRef={mobileSentinelRef}
            sessions={sessions}
          />
        </div>
      ) : null}

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
            sessionsLabel={t("sessions")}
            placeholder={t("placeholder")}
            onFirstMessage={onFirstMessage}
            pendingPrompt={pendingPrompt}
            createSession={createSession}
            activateSession={activateSession}
            deleteSession={deleteSession}
            onOpenSessions={() => setMobileSessionsOpen(true)}
            onPendingPromptConsumed={() => setPendingPrompt(null)}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center border-b border-border px-3 py-2.5 md:hidden">
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => setMobileSessionsOpen(true)}
                aria-label={t("sessions")}
                className="mr-2"
              >
                <MessagesSquare className="size-4" />
              </Button>
              <span className="truncate text-sm font-medium">
                {t("sessions")}
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground text-xs">
              {t("empty")}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SessionSidebar({
  activeId,
  className,
  loading,
  loadingMore,
  onClose,
  onDelete,
  onNewChat,
  onSelectSession,
  sentinelRef,
  sessions,
}: {
  activeId: string | null;
  className?: string;
  loading: boolean;
  loadingMore: boolean;
  onClose?: () => void;
  onDelete: (sessionId: string) => void;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  sentinelRef: RefObject<HTMLDivElement | null>;
  sessions: AgentSessionSummary[];
}) {
  const t = useTranslations("Agent");

  return (
    <aside className={cn("flex flex-col bg-background", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border py-2 pl-4 pr-2">
        <span className="flex items-center gap-1.5 font-medium">
          <MessagesSquare className="size-3.5" />
          {t("sessions")}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon-xs"
            variant="outline"
            onClick={onNewChat}
            aria-label={t("newChat")}
          >
            <Plus />
          </Button>
          {onClose ? (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onClose}
              aria-label="Close sessions"
            >
              <X />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : sessions.length === 0 ? (
          <p className="px-2 py-4 text-center text-muted-foreground text-xs">
            {t("empty")}
          </p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((s) => (
              <li key={s.sessionId}>
                <button
                  type="button"
                  onClick={() => onSelectSession(s.sessionId)}
                  className={`group flex w-full items-center gap-1 rounded-md px-3 py-2 text-left transition-colors ${
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
                      onDelete(s.sessionId);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onDelete(s.sessionId);
                      }
                    }}
                    className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  />
                </button>
              </li>
            ))}
            <li>
              <div ref={sentinelRef} className="h-1" />
            </li>
            {loadingMore ? (
              <li className="flex justify-center py-2">
                <Spinner />
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </aside>
  );
}

function ActiveChat({
  sessionId,
  apiOrigin,
  appCode,
  title,
  sessionsLabel,
  placeholder,
  onFirstMessage,
  pendingPrompt,
  createSession,
  activateSession,
  deleteSession,
  onOpenSessions,
  onPendingPromptConsumed,
}: {
  sessionId: string;
  apiOrigin: string;
  appCode: string;
  title: string;
  sessionsLabel: string;
  placeholder: string;
  onFirstMessage: (sessionId: string) => void;
  pendingPrompt: string | null;
  createSession: () => Promise<string>;
  activateSession: (sessionId: string, prompt: string | null) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  onOpenSessions: () => void;
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
      submitToolResult={chat.submitToolResult}
      status={chat.status}
      isLoadingHistory={chat.isLoadingHistory}
      stop={chat.stop}
      error={chat.error}
      placeholder={placeholder}
      header={
        <div className="flex shrink-0 items-center border-b border-border px-3 py-2.5 pr-12">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={onOpenSessions}
            aria-label={sessionsLabel}
            className="mr-2 md:hidden"
          >
            <MessagesSquare className="size-4" />
          </Button>
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
      }
    />
  );
}
