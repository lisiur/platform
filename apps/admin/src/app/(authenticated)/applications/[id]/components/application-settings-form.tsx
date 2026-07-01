"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui";
import { useTranslations } from "next-intl";
import { ApplicationBasicInfoForm } from "./application-basic-info-form";
import { ApplicationFaviconForm } from "./application-favicon-form";
import { ApplicationLogoForm } from "./application-logo-form";

interface ApplicationSettingsFormProps {
  app: {
    id: string;
    name: string;
    code: string;
    description?: string | null;
    logo?: string | null;
    favicon?: string | null;
  };
  onSuccess: () => void;
}

export function ApplicationSettingsForm({
  app,
  onSuccess,
}: ApplicationSettingsFormProps) {
  const t = useTranslations("Applications");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>{t("logoTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ApplicationLogoForm
              appId={app.id}
              currentLogo={app.logo}
              onSuccess={onSuccess}
            />
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>{t("faviconTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ApplicationFaviconForm
              appId={app.id}
              currentFavicon={app.favicon}
              onSuccess={onSuccess}
            />
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>{t("basicInfoTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ApplicationBasicInfoForm
              appId={app.id}
              app={app}
              onSuccess={onSuccess}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
