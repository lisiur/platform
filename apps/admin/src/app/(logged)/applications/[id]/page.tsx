"use client";

import { ArrowLeft, Settings } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { appClient } from "@/lib/api";
import { apiWithFeedback } from "@/lib/api/utils";

interface Application {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  logo?: string | null;
  sortOrder: number;
  createdAt: string;
}

interface ApplicationDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ApplicationDetailPage({
  params,
}: ApplicationDetailPageProps) {
  const t = useTranslations("Applications");
  const { id } = use(params);
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchApp = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiWithFeedback(appClient.api.applications[":id"].$get)(
        {
          param: { id },
        },
      );
      setApp(await res.json());
    } catch {
      toast.error(t("fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    fetchApp();
  }, [fetchApp]);

  if (loading) {
    return (
      <div className="container mx-auto flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-muted-foreground">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/applications">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{app.name}</h1>
          <p className="text-muted-foreground">{app.code}</p>
        </div>
      </div>

      {app.description && (
        <p className="mb-6 text-muted-foreground">{app.description}</p>
      )}

      <div className="flex gap-4">
        <Link href={`/applications/${id}/menus`}>
          <Button variant="outline" className="gap-2">
            <Settings className="h-4 w-4" />
            {t("manageMenus")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
