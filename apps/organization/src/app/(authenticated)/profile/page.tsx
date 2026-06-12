"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useSession } from "@/lib/api";

export default function OrganizationProfilePage() {
  const t = useTranslations("Profile");
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
              {user?.image ? (
                <Image
                  src={user.image}
                  alt={user.name ?? ""}
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <span className="font-semibold text-sm">
                  {user?.name?.slice(0, 2).toUpperCase() ?? ""}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium">{user?.name}</p>
              <p className="truncate text-muted-foreground text-sm">
                {user?.email}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
