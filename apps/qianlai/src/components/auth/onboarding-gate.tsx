"use client";

import { hasPendingOnboarding } from "@repo/shared";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/api";

/**
 * First-run gate: users still carrying the onboarding-pending flag are sent
 * to /onboarding from any authenticated page, not just via sign-in — a live
 * session (page reload, bookmark, another device) never passes through the
 * auth pages. Renders nothing until the flag is cleared.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  const router = useRouter();

  const flagged = !!data && hasPendingOnboarding(data.user.flags);

  useEffect(() => {
    if (isPending || !data || !flagged) return;
    router.replace("/onboarding");
  }, [isPending, data, flagged, router]);

  if (flagged) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
