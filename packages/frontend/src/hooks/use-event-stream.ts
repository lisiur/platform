"use client";

import { useEffect, useRef, useState } from "react";

export type SseEventHandler = (event: MessageEvent) => void;

export type SseConnectionState = "connecting" | "open" | "closed";

export interface EventStreamOptions {
  origin: string;
  appCode: string;
}

interface Connection {
  es: EventSource;
  refs: number;
}

const connections = new Map<string, Connection>();

function acquire({ origin, appCode }: EventStreamOptions): EventSource {
  const key = `${origin}|${appCode}`;
  let entry = connections.get(key);
  if (!entry) {
    const url = `${origin}/api/events?app=${encodeURIComponent(appCode)}`;
    entry = { es: new EventSource(url, { withCredentials: true }), refs: 0 };
    connections.set(key, entry);
  }
  entry.refs++;
  return entry.es;
}

function release({ origin, appCode }: EventStreamOptions): void {
  const key = `${origin}|${appCode}`;
  const entry = connections.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    entry.es.close();
    connections.delete(key);
  }
}

function readyStateOf(es: EventSource): SseConnectionState {
  switch (es.readyState) {
    case EventSource.OPEN:
      return "open";
    case EventSource.CLOSED:
      return "closed";
    default:
      return "connecting";
  }
}

export interface UseEventStreamOptions extends EventStreamOptions {
  event: string;
  handler: SseEventHandler;
  enabled?: boolean;
}

export function useEventStream({
  origin,
  appCode,
  event,
  handler,
  enabled = true,
}: UseEventStreamOptions): SseConnectionState {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const [connection, setConnection] =
    useState<SseConnectionState>("connecting");

  useEffect(() => {
    if (!enabled) return;
    const es = acquire({ origin, appCode });
    setConnection(readyStateOf(es));

    const onOpen = () => setConnection("open");
    // EventSource fires `error` on every failed attempt while it keeps retrying
    // (readyState CONNECTING); CLOSED means it gave up entirely.
    const onError = () => setConnection(readyStateOf(es));
    const onMessage = (e: MessageEvent) => handlerRef.current(e);

    es.addEventListener("open", onOpen);
    es.addEventListener("error", onError);
    es.addEventListener(event, onMessage as EventListener);

    return () => {
      es.removeEventListener("open", onOpen);
      es.removeEventListener("error", onError);
      es.removeEventListener(event, onMessage as EventListener);
      release({ origin, appCode });
    };
  }, [origin, appCode, event, enabled]);

  return connection;
}
