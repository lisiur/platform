"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/api";
import { appClient } from "@/lib/api/app-client";
import { withApiFeedback } from "@/lib/api/utils";

export function useNotificationCount() {
  const session = useSession();

  const query = useQuery({
    queryKey: ["notification-unread-count"],
    enabled: !session.isPending && !!session.data,
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.notifications["unread-count"].$get,
      )();
      const data = await res.json();
      return data.count;
    },
  });

  return {
    count: query.data ?? 0,
    loading: query.isLoading,
    refresh: query.refetch,
  };
}

export function useInvalidateNotificationCount() {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({
      queryKey: ["notification-unread-count"],
    });
}
