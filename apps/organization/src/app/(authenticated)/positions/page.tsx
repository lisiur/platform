"use client";

import { Spinner } from "@repo/ui";
import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { useSession } from "@/lib/api";
import { PositionTable } from "./components/position-table";

export default function PositionsPage() {
  const t = useTranslations("Positions");
  const { data: session } = useSession();
  const orgId = session?.session.activeOrganizationId;

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      {orgId ? (
        <PositionTable orgId={orgId} />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8">
          <Spinner />
        </div>
      )}
    </ManagementPageShell>
  );
}
