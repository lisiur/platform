"use client";

import { hasPendingOnboarding } from "@repo/shared";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
} from "@repo/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { appClient, useSession, withApiFeedback } from "@/lib/api";
import { redirectAfterAuth } from "@/lib/navigation/menu-redirect";
import { useMenuStore } from "@/stores/menu-store";
import { useSessionStore } from "@/stores/session-store";
import { LedgerStep } from "./components/ledger-step";
import { ProfileStep } from "./components/profile-step";

export default function OnboardingPage() {
  const t = useTranslations("Onboarding");
  const router = useRouter();
  const session = useSession();
  const refetchMenus = useMenuStore((state) => state.refetchMenus);
  const [finishing, setFinishing] = useState(false);
  const redirectStartedRef = useRef(false);

  const user = session.data?.user ?? null;
  const onboarded = !!user && !hasPendingOnboarding(user.flags);

  // Only first-time users (flag still set) see the guide; everyone else is
  // sent to the sign-in page (no session) or the app (already onboarded).
  useEffect(() => {
    if (session.isPending) return;
    if (!session.data) {
      router.replace("/sign-in");
      return;
    }
    if (onboarded && !redirectStartedRef.current) {
      redirectStartedRef.current = true;
      void redirectAfterAuth(router, refetchMenus, session.data.user.flags);
    }
  }, [session, onboarded, router, refetchMenus]);

  async function complete() {
    setFinishing(true);
    try {
      await withApiFeedback(appClient.api.auth["complete-onboarding"].$post)();
      await useSessionStore.getState().refetchSession();
    } catch {
      // Errors are surfaced by withApiFeedback; the effect redirects once
      // refetchSession clears the onboarding flag.
    } finally {
      setFinishing(false);
    }
  }

  if (session.isPending || !user || onboarded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-muted/30">
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              {t("welcome", { name: user.name })}
            </CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div>
              <h2 className="mb-3 font-semibold">{t("profileTitle")}</h2>
              <ProfileStep
                initialName={user.name}
                initialAvatar={user.avatar}
              />
            </div>
            <Separator />
            <div>
              <h2 className="mb-1 font-semibold">{t("ledgerTitle")}</h2>
              <p className="text-muted-foreground mb-3 text-sm">
                {t("ledgerHint")}
              </p>
              <LedgerStep />
            </div>
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={complete}
                disabled={finishing}
              >
                {t("skip")}
              </Button>
              <Button type="button" onClick={complete} disabled={finishing}>
                {t("start")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
