"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useSession } from "@/lib/api";

const EXEMPT_PATHS = ["/register-organization", "/choose-organization"];

export function OrganizationGuard({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const redirectedRef = useRef(false);

  const needsOrganization = session && !session.session.activeOrganizationId;

  useEffect(() => {
    if (!needsOrganization || redirectedRef.current) return;
    if (EXEMPT_PATHS.includes(pathname)) return;

    redirectedRef.current = true;
    router.replace("/choose-organization");
  }, [needsOrganization, pathname, router]);

  if (needsOrganization && !EXEMPT_PATHS.includes(pathname)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
