"use client";

import { Spinner } from "@repo/ui";
import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { useSession } from "@/lib/api";
import { MemberTable } from "./components/member-table";

export default function MembersPage() {
  const t = useTranslations("Members");
  const { data: session } = useSession();
  const organizationId = session?.session.activeOrganizationId;

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      {organizationId ? (
        <MemberTable organizationId={organizationId} />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8">
          <Spinner />
        </div>
      )}
    </ManagementPageShell>
  );
}
