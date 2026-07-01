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
import { getFirstMenuUrl, useMenuStore } from "@/stores/menu-store";

const ADMIN_BASE_PATH = "/admin";

function toAppPath(url: string) {
  if (!url.startsWith(ADMIN_BASE_PATH)) return url;
  return url.slice(ADMIN_BASE_PATH.length) || "/";
}

async function redirectAfterAuthentication(
  router: ReturnType<typeof useRouter>,
  refetchMenus: () => Promise<void>,
) {
  try {
    await refetchMenus();
    const { menus } = useMenuStore.getState();
    const firstUrl = getFirstMenuUrl(menus);
    if (firstUrl) {
      router.push(toAppPath(firstUrl));
      return;
    }
  } catch {
    // Fallback to profile
  }
  router.push("/profile");
}

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("Auth");
  const { data: session, isPending } = useSession();
  const refetchMenus = useMenuStore((s) => s.refetchMenus);
  const handledValidSessionRef = useRef(false);

  const handleLoginSuccess = () =>
    redirectAfterAuthentication(router, refetchMenus);

  useEffect(() => {
    if (!session || handledValidSessionRef.current) return;
    handledValidSessionRef.current = true;
    void redirectAfterAuthentication(router, refetchMenus);
  }, [session, router, refetchMenus]);

  if (isPending || session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("welcomeBack")}</CardTitle>
          <CardDescription>{t("signInDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm
            onSuccess={handleLoginSuccess}
            onSwitchToRegister={() => router.push("/register")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
