"use client";

import { useQuery } from "@tanstack/react-query";

export interface AppleStatus {
  appleEnabled: boolean;
  clientId: string | null;
}

/**
 * Reports whether Sign in with Apple is enabled server-side, along with the
 * Apple client (Services) ID needed to initialize the browser SDK.
 *
 * Defaults to disabled while loading so the Apple button does not appear
 * before the server confirms Apple is configured.
 *
 * @param fetcher - resolves to the Apple status payload.
 */
export function useAppleEnabled(
  fetcher: () => Promise<AppleStatus>,
  options?: { enabled?: boolean },
) {
  const query = useQuery({
    queryKey: ["auth", "apple-status"],
    queryFn: fetcher,
    enabled: options?.enabled ?? true,
  });
  return {
    appleEnabled: query.data?.appleEnabled ?? false,
    clientId: query.data?.clientId ?? null,
    isLoading: query.isLoading,
  };
}
