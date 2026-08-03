"use client";

import { useEventStream } from "@repo/frontend";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  API_ORIGIN,
  APP_CODE,
  appClient,
  useSession,
  withApiFeedback,
} from "@/lib/api";

export interface UserNotification {
  id: string;
  renderedTitle: string | null;
  renderedBody: string;
  readAt: string | null;
  createdAt: string;
}

const NOTIFICATION_KEY = ["notifications"] as const;

function invalidateNotifications(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: NOTIFICATION_KEY });
}

export function useUnreadNotificationCount() {
  const { data: session } = useSession();
  const qc = useQueryClient();

  useEventStream({
    origin: API_ORIGIN,
    appCode: APP_CODE,
    event: "notification.created",
    enabled: !!session?.user,
    handler: () => invalidateNotifications(qc),
  });

  return useQuery({
    queryKey: [...NOTIFICATION_KEY, "unread-count"] as const,
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.notifications["unread-count"].$get,
        { showError: false },
      )();
      const data = await res.json();
      return data.count;
    },
    enabled: !!session?.user,
  });
}

export function useRecentNotifications(enabled: boolean) {
  return useQuery({
    queryKey: [...NOTIFICATION_KEY, "list", "recent"] as const,
    queryFn: async () => {
      const res = await withApiFeedback(appClient.api.notifications.$get, {
        showError: false,
      })({
        query: { limit: 5, offset: 0 },
      });
      const data = await res.json();
      return data.notifications;
    },
    enabled,
  });
}

export function useMarkNotificationRead() {
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

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await withApiFeedback(appClient.api.notifications["read-all"].$patch)();
    },
    onSuccess: () => invalidateNotifications(qc),
  });
}
