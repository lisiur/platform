"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { appClient, useSession, withApiFeedback } from "@/lib/api";
import { redirectToFirstMenuOrProfile } from "@/lib/navigation/menu-redirect";
import { useMenuStore } from "@/stores/menu-store";

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: string | null;
  createdAt: string;
}

export function OrganizationChooser() {
  const router = useRouter();
  const t = useTranslations("ChooseOrganization");
  const { refetch: refetchSession } = useSession();
  const refetchMenus = useMenuStore((state) => state.refetchMenus);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["organizations", "mine"],
    queryFn: async () => {
      const res = await appClient.api.organizations.mine.$get();
      if (!res.ok) throw new Error("Failed to load organizations");
      return (await res.json()) as { organizations: Organization[] };
    },
  });

  const organizations = data?.organizations ?? [];

  async function handleSelect(org: Organization) {
    setActivatingId(org.id);
    try {
      await withApiFeedback(appClient.api.organizations[":id"].activate.$post)({
        param: { id: org.id },
      });
      await refetchSession();
      toast.success(t("activateSuccess"));
      await redirectToFirstMenuOrProfile(router, refetchMenus);
    } catch {
      setActivatingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">{t("loadFailed")}</p>
        </CardContent>
      </Card>
    );
  }

  if (organizations.length === 0) {
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>{t("empty")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={() => router.push("/register-organization")}>
            <Plus className="mr-2 h-4 w-4" />
            {t("createButton")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {organizations.map((org) => {
        const isActivating = activatingId === org.id;
        return (
          <Card key={org.id}>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                {org.logo ? (
                  <Image
                    src={org.logo}
                    alt={org.name}
                    width={40}
                    height={40}
                    className="rounded-lg object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{org.name}</p>
                  <p className="truncate text-muted-foreground text-sm">
                    {org.slug}
                  </p>
                </div>
              </div>
              <Button
                className="w-full"
                disabled={activatingId !== null}
                onClick={() => handleSelect(org)}
              >
                {isActivating ? t("activating") : t("select")}
              </Button>
            </CardContent>
          </Card>
        );
      })}

      <Card className="flex items-center justify-center border-dashed">
        <CardContent className="flex flex-col items-center gap-2 py-6">
          <Button
            variant="ghost"
            onClick={() => router.push("/register-organization")}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("createButton")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
