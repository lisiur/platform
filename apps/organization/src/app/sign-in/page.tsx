"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { useSession } from "@/lib/api";
import { redirectToFirstMenuOrProfile } from "@/lib/navigation/menu-redirect";
import { useMenuStore } from "@/stores/menu-store";

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("Auth");
  const { data: session, isPending, refetch } = useSession();
  const refetchMenus = useMenuStore((state) => state.refetchMenus);
  const handledValidSessionRef = useRef(false);

  async function handleLoginSuccess() {
    await refetch();
    await redirectToFirstMenuOrProfile(router, refetchMenus);
  }

  useEffect(() => {
    if (!session || handledValidSessionRef.current) return;
    handledValidSessionRef.current = true;
    void redirectToFirstMenuOrProfile(router, refetchMenus);
  }, [session, router, refetchMenus]);

  if (isPending || session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("welcomeBack")}</CardTitle>
          <CardDescription>{t("signInDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm onSuccess={handleLoginSuccess} />
        </CardContent>
      </Card>
    </main>
  );
}
