"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { appClient, useSession, withApiFeedback } from "@/lib/api";
import { redirectToFirstMenuOrProfile } from "@/lib/navigation/menu-redirect";
import { useMenuStore } from "@/stores/menu-store";

interface SwitchableOrganization {
  id: string;
  name: string;
}

export function useSwitchOrganization() {
  const session = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const refetchMenus = useMenuStore((state) => state.refetchMenus);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const activeOrganizationId =
    session.data?.session.activeOrganizationId ?? null;

  async function switchOrg(
    org: SwitchableOrganization,
    successMessage?: string,
  ) {
    if (org.id === activeOrganizationId) return;

    setActivatingId(org.id);
    try {
      await withApiFeedback(appClient.api.organizations[":id"].activate.$post)({
        param: { id: org.id },
      });
      // Menus and org-scoped data (members, settings) are organization-bound.
      // Drop cached queries so stale data never bleeds across organizations.
      queryClient.clear();
      await session.refetch();
      await redirectToFirstMenuOrProfile(router, refetchMenus);
      toast.success(successMessage ?? org.name);
    } catch {
      setActivatingId(null);
    }
  }

  return { switchOrg, activatingId, activeOrganizationId };
}
