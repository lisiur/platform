"use client";

import { ManagementPageShell } from "@/components/management-page-shell";
import { QuotaTable } from "./components/quota-table";

export default function QuotasPage() {
  return (
    <ManagementPageShell
      title="Quotas"
      description="Manage user feature quotas."
    >
      <div className="flex-1 overflow-y-auto">
        <QuotaTable />
      </div>
    </ManagementPageShell>
  );
}
