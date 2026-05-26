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
import { appClient } from "@/lib/api";
import { apiWithFeedback } from "@/lib/api/utils";
import { getFirstMenuUrl } from "@/lib/menu-utils";

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("Auth");

  const handleLoginSuccess = async () => {
    try {
      const res = await apiWithFeedback(appClient.api["menu-role"].mine.$get)();
      const data = await res.json();
      const firstUrl = getFirstMenuUrl(data.menus);
      if (firstUrl) {
        router.push(firstUrl);
        return;
      }
    } catch {
      // Fallback to dashboard
    }
    router.push("/");
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
