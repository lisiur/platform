"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ManagementPageShell } from "@/components/management-page-shell";
import { appClient, useSession, withApiFeedback } from "@/lib/api";
import { OrgInfoForm } from "./components/org-info-form";
import { OrgLogoUpload } from "./components/org-logo-upload";

interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
}

export default function SettingsPage() {
  const t = useTranslations("Settings");
  const { data: session } = useSession();
  const organizationId = session?.session.activeOrganizationId;
  const queryClient = useQueryClient();

  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    setLoading(true);
    withApiFeedback(appClient.api.organizations[":id"].settings.$get)({
      param: { id: organizationId },
    })
      .then(async (res) => {
        const data = await res.json();
        if (active) setOrg(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId]);

  function invalidateMine() {
    void queryClient.invalidateQueries({ queryKey: ["organizations", "mine"] });
  }

  if (loading) {
    return (
      <ManagementPageShell title={t("title")} description={t("description")}>
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </ManagementPageShell>
    );
  }

  if (failed || !org) {
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
              <CardTitle>{t("logo")}</CardTitle>
            </CardHeader>
            <CardContent>
              <OrgLogoUpload
                organizationId={org.id}
                currentLogo={org.logo}
                name={org.name}
                onLogoUpdate={(url) => {
                  setOrg({ ...org, logo: url });
                  invalidateMine();
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("generalInfo")}</CardTitle>
            </CardHeader>
            <CardContent>
              <OrgInfoForm
                organizationId={org.id}
                initialName={org.name}
                initialSlug={org.slug}
                onUpdated={({ name, slug }) => {
                  setOrg({ ...org, name, slug });
                  invalidateMine();
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </ManagementPageShell>
  );
}
