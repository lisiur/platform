"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/api";
import { AvatarUpload } from "./components/avatar-upload";
import { PasswordForm } from "./components/password-form";
import { ProfileForm } from "./components/profile-form";

export default function ProfilePage() {
  const t = useTranslations("Profile");
  const [user, setUser] = useState<{
    id: string;
    name: string;
    email: string;
    image?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await authClient.getSession();
        if (data?.user) {
          setUser({
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            image: data.user.image,
          });
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-muted-foreground">{t("loadFailed")}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

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
  );
}
