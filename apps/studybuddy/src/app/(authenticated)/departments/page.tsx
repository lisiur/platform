"use client";

import { Spinner } from "@repo/ui";
import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { useSession } from "@/lib/api";
import { DepartmentTable } from "./components/department-table";

export default function DepartmentsPage() {
  const t = useTranslations("Departments");
  const { data: session } = useSession();
  const orgId = session?.session.activeOrganizationId;

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      {orgId ? (
        <DepartmentTable orgId={orgId} />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8">
          <Spinner />
        </div>
      )}
    </ManagementPageShell>
  );
}
