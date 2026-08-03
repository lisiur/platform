"use client";

import { useQuery } from "@tanstack/react-query";
import { appClient, useSession, withApiFeedback } from "@/lib/api";

export function useCurrentOrganization() {
  const { data: session } = useSession();
  const activeOrganizationId = session?.session.activeOrganizationId;

  const query = useQuery({
    queryKey: ["organizations", "mine"],
    queryFn: async () => {
      const res = await withApiFeedback(appClient.api.organizations.mine.$get, {
        showError: false,
      })();
      return res.json();
    },
    enabled: !!activeOrganizationId,
  });

  const organization = query.data?.organizations.find(
    (org) => org.id === activeOrganizationId,
  );

  return {
    organization: organization ?? null,
    loading: query.isLoading && !!activeOrganizationId,
  };
}
