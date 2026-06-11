"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirstMenuUrl, useMenuStore } from "@/stores/menu-store";

const ADMIN_BASE_PATH = "/admin";

function toAppPath(url: string) {
  if (!url.startsWith(ADMIN_BASE_PATH)) return url;
  return url.slice(ADMIN_BASE_PATH.length) || "/";
}

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("Auth");
  const refetchMenus = useMenuStore((s) => s.refetchMenus);

  const handleLoginSuccess = async () => {
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
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4">
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
