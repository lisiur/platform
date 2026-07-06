"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appClient, useSession } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

export interface UserNotification {
  id: string;
  renderedTitle: string | null;
  renderedBody: string;
  readAt: string | null;
  createdAt: string;
}

type ListResponse = { notifications: UserNotification[]; total: number };

const NOTIFICATION_KEY = ["notifications"] as const;

function invalidateNotifications(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: NOTIFICATION_KEY });
}

export function useUnreadNotificationCount() {
  const { data: session } = useSession();
  return useQuery({
    queryKey: [...NOTIFICATION_KEY, "unread-count"] as const,
    queryFn: async () => {
      const res = await appClient.api.notifications["unread-count"].$get();
      if (!res.ok) throw new Error("Failed to load unread count");
      const data = (await res.json()) as { count: number };
      return data.count;
    },
    enabled: !!session?.user,
  });
}

export function useRecentNotifications(enabled: boolean) {
  return useQuery({
    queryKey: [...NOTIFICATION_KEY, "list", "recent"] as const,
    queryFn: async () => {
      const res = await appClient.api.notifications.$get({
        query: { limit: 5, offset: 0 },
      });
      if (!res.ok) throw new Error("Failed to load notifications");
      const data = (await res.json()) as ListResponse;
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
