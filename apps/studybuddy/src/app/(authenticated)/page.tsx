"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { redirectToFirstMenuOrProfile } from "@/lib/navigation/menu-redirect";
import { useMenuStore } from "@/stores/menu-store";

export default function OrganizationHomePage() {
  const router = useRouter();
  const refetchMenus = useMenuStore((state) => state.refetchMenus);
  const redirectStartedRef = useRef(false);

  useEffect(() => {
    if (redirectStartedRef.current) return;
    redirectStartedRef.current = true;
    void redirectToFirstMenuOrProfile(router, refetchMenus);
  }, [router, refetchMenus]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}
