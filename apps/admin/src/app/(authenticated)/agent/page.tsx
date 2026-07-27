"use client";

import { AgentChat, useAgentChat, useEventStream } from "@repo/frontend";
import { Button, Spinner } from "@repo/ui";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { ManagementPageShell } from "@/components/management-page-shell";
import { API_ORIGIN, APP_CODE } from "@/lib/api";
import { appClient } from "@/lib/api/app-client";
import { withApiFeedback } from "@/lib/api/utils";

interface SessionSummary {
  sessionId: string;
  name: string | null;
  createdAt: number;
}

const PAGE_SIZE = 20;
const NEW_CHAT_ID = "__NEW__";

export default function AgentPage() {
  const t = useTranslations("Agent");

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [_total, setTotal] = useState(0);
  const initialLoadRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await withApiFeedback(appClient.api.agent.sessions.$get)({
        query: { limit: PAGE_SIZE, offset },
      });
      if (res.ok) {
        const data = await res.json();
        if (append) {
          setSessions((prev) => [...prev, ...data.sessions]);
        } else {
          setSessions(data.sessions);
        }
        setTotal(data.total);
        setHasMore(offset + data.sessions.length < data.total);
      }
    } catch {
      if (!append) setSessions([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    fetchPage(0, false);
  }, [fetchPage]);

  // Auto-select the most recent session once on initial load.
  useEffect(() => {
    if (!activeId && sessions.length > 0) {
      setActiveId(sessions[0].sessionId);
    }
  }, [sessions, activeId]);

  // IntersectionObserver for scroll-to-bottom lazy loading.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          fetchPage(sessions.length, true);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, sessions.length, fetchPage]);

  useEventStream({
    origin: API_ORIGIN,
    appCode: APP_CODE,
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

  async function handleCreateSession(prompt: string) {
    const res = await withApiFeedback(appClient.api.agent.sessions.$post)({});
    if (!res.ok) return;
    const data = await res.json();
    setPendingPrompt(prompt);
    setActiveId(data.sessionId);
  }

  const onFirstMessage = useCallback((sessionId: string) => {
    setSessions((prev) => {
      if (prev.some((s) => s.sessionId === sessionId)) return prev;
      return [{ sessionId, name: null, createdAt: Date.now() }, ...prev];
    });
    setTotal((prev) => prev + 1);
  }, []);

  async function handleDelete(sessionId: string) {
    try {
      const res = await withApiFeedback(
        appClient.api.agent.sessions[":id"].$delete,
      )({ param: { id: sessionId } });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
        setTotal((prev) => prev - 1);
        setActiveId((curr) => (curr === sessionId ? null : curr));
      }
    } catch {
      // Error surfaced by withApiFeedback.
    }
  }

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Session sidebar — app-owned session lifecycle */}
        <aside className="flex w-60 shrink-0 flex-col rounded-md border border-border">
          <div className="flex items-center justify-between gap-2 border-b border-border p-3">
            <span className="text-sm font-medium">{t("sessions")}</span>
            <Button size="sm" variant="outline" onClick={handleNewChat}>
              <Plus className="h-4 w-4" />
              <span className="ml-1">{t("newChat")}</span>
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : sessions.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                {t("empty")}
              </p>
            ) : (
              <ul className="space-y-1">
                {sessions.map((s) => (
                  <li key={s.sessionId}>
                    <button
                      type="button"
                      onClick={() => handleSelectSession(s.sessionId)}
                      className={`group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors ${
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
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
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
        <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-md border border-border bg-card">
          {activeId ? (
            <ActiveChat
              key={activeId}
              sessionId={activeId}
              title={
                sessions.find((s) => s.sessionId === activeId)?.name ??
                t("untitled")
              }
              placeholder={t("placeholder")}
              onFirstMessage={onFirstMessage}
              pendingPrompt={pendingPrompt}
              onCreateSession={handleCreateSession}
              onPendingPromptConsumed={() => setPendingPrompt(null)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          )}
        </section>
      </div>
    </ManagementPageShell>
  );
}

function ActiveChat({
  sessionId,
  title,
  placeholder,
  onFirstMessage,
  pendingPrompt,
  onCreateSession,
  onPendingPromptConsumed,
}: {
  sessionId: string;
  title: string;
  placeholder: string;
  onFirstMessage: (sessionId: string) => void;
  pendingPrompt: string | null;
  onCreateSession: (prompt: string) => void;
  onPendingPromptConsumed: () => void;
}) {
  const isNew = sessionId === NEW_CHAT_ID;
  const chat = useAgentChat({
    sessionId: isNew ? null : sessionId,
    apiOrigin: API_ORIGIN,
    appCode: APP_CODE,
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

  function handleSend(text: string) {
    if (isNew) {
      onCreateSession(text);
      return;
    }
    chat.sendMessage(text);
  }

  return (
    <AgentChat
      messages={chat.messages}
      sendMessage={handleSend}
      status={chat.status}
      stop={chat.stop}
      error={chat.error}
      placeholder={placeholder}
      header={
        <div className="flex shrink-0 items-center border-b border-border px-3 py-2.5">
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
      }
    />
  );
}
