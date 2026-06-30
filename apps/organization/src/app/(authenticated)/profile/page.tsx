"use client";

import { Card, CardContent, CardHeader, CardTitle, Separator } from "@repo/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ManagementPageShell } from "@/components/management-page-shell";
import { useSession } from "@/lib/api/use-session";
import { AvatarUpload } from "./components/avatar-upload";
import { PasswordForm } from "./components/password-form";
import { ProfileForm } from "./components/profile-form";

export default function ProfilePage() {
  const t = useTranslations("Profile");
  const session = useSession();
  const [user, setUser] = useState<{
    id: string;
    name: string;
    email: string;
    image?: string | null;
  } | null>(null);

  useEffect(() => {
    if (session.data?.user) {
      setUser({
        id: session.data.user.id,
        name: session.data.user.name,
        email: session.data.user.email,
        image: session.data.user.image,
      });
    }
  }, [session.data]);

  if (session.isPending) {
    return (
      <ManagementPageShell title={t("title")} description={t("description")}>
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </ManagementPageShell>
    );
  }

  if (!user) {
    return (
      <ManagementPageShell title={t("title")} description={t("description")}>
        <p className="text-muted-foreground">{t("loadFailed")}</p>
      </ManagementPageShell>
    );
  }

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("avatar")}</CardTitle>
            </CardHeader>
            <CardContent>
              <AvatarUpload
                currentImage={user.image}
                name={user.name}
                onImageUpdate={(url) => setUser({ ...user, image: url })}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("personalInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-muted-foreground">
                  {t("email")}
                </label>
                <p className="text-sm">{user.email}</p>
              </div>
              <Separator />
              <ProfileForm
                initialName={user.name}
                onNameUpdate={(name) => setUser({ ...user, name })}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("changePassword")}</CardTitle>
            </CardHeader>
            <CardContent>
              <PasswordForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </ManagementPageShell>
  );
}
