"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClientResponse } from "hono/client";
import { useEventStream } from "../hooks/use-event-stream";
import { withApiFeedback } from "../lib/api-utils";
import type { SessionData } from "../types";
import type { UserNotification } from "./types";

// biome-ignore lint/suspicious/noExplicitAny: Hono RPC client methods are overloaded and app-generated.
type ApiMethod<Args extends unknown[] = any[]> = (
  ...args: Args
  // biome-ignore lint/suspicious/noExplicitAny: Hono client response carries generated payload/status metadata.
) => Promise<ClientResponse<any, any, any>>;

export interface NotificationAppClient {
  api: {
    notifications: {
      $get: ApiMethod<
        [
          {
            query: {
              limit: number;
              offset: number;
              unreadOnly?: boolean;
            };
          },
        ]
      >;
      "unread-count": {
        $get: ApiMethod;
      };
      "read-all": {
        $patch: ApiMethod;
      };
      ":id": {
        read: {
          $patch: ApiMethod<[{ param: { id: string } }]>;
        };
      };
    };
  };
}

export interface NotificationHooksDeps {
  appClient: NotificationAppClient;
  useSession: () => { data: SessionData };
  apiOrigin: string;
  appCode: string;
}

export interface ListNotificationsResult {
  notifications: UserNotification[];
  total: number;
}

const NOTIFICATION_KEY = ["notifications"] as const;

function invalidateNotifications(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: NOTIFICATION_KEY });
}

export function createNotificationHooks({
  appClient,
  useSession,
  apiOrigin,
  appCode,
}: NotificationHooksDeps) {
  function useUnreadNotificationCount(enabled = true) {
    const { data: session } = useSession();
    const qc = useQueryClient();
    const ready = enabled && !!session?.user;

    useEventStream({
      origin: apiOrigin,
      appCode,
      event: "notification.created",
      enabled: ready,
      handler: () => invalidateNotifications(qc),
    });

    return useQuery({
      queryKey: [...NOTIFICATION_KEY, "unread-count"] as const,
      queryFn: async () => {
        const res = await withApiFeedback(
          appClient.api.notifications["unread-count"].$get,
          { showError: false },
        )();
        const data = (await res.json()) as { count: number };
        return data.count;
      },
      enabled: ready,
    });
  }

  function useRecentNotifications(enabled: boolean) {
    const { data: session } = useSession();

    return useQuery({
      queryKey: [...NOTIFICATION_KEY, "list", "recent"] as const,
      queryFn: async () => {
        const res = await withApiFeedback(appClient.api.notifications.$get, {
          showError: false,
        })({
          query: { limit: 5, offset: 0 },
        });
        const data = (await res.json()) as ListNotificationsResult;
        return data.notifications;
      },
      enabled: enabled && !!session?.user,
    });
  }

  function useMarkNotificationRead() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (id: string) => {
        await withApiFeedback(appClient.api.notifications[":id"].read.$patch)({
          param: { id },
        });
      },
      onSuccess: () => invalidateNotifications(qc),
    });
  }

  function useMarkAllNotificationsRead() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async () => {
        await withApiFeedback(appClient.api.notifications["read-all"].$patch)();
      },
      onSuccess: () => invalidateNotifications(qc),
    });
  }

  return {
    useUnreadNotificationCount,
    useRecentNotifications,
    useMarkNotificationRead,
    useMarkAllNotificationsRead,
  };
}

export type NotificationHooks = ReturnType<typeof createNotificationHooks>;
