"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RegisterForm } from "@/components/auth/register-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations("Auth");

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("createAccount")}</CardTitle>
          <CardDescription>{t("signUpDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterForm
            onSuccess={() => router.push("/")}
            onSwitchToLogin={() => router.push("/login")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
