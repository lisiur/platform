"use client";

import {
  Button,
  ButtonGroup,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { PaginatedTableFrame } from "@/components/paginated-table-frame";
import { useConfirm } from "@/hooks/use-confirm";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";
import { OrganizationDialog } from "./organization-dialog";

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: string | null;
  createdAt: string;
}

export function OrganizationTable() {
  const t = useTranslations("Organizations");
  const confirm = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);

  const {
    items: organizations,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh: fetchOrganizations,
  } = usePaginatedQuery<Organization>({
    queryKey: ["organizations"],
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(appClient.api.organizations.$get)({
        query: { limit, offset },
      });
      const data = await res.json();
      return { items: data.organizations, total: data.total };
    },
  });

  function handleEditSuccess() {
    setEditOrg(null);
    fetchOrganizations();
    toast.success(t("updateSuccess"));
  }

  function handleCreateSuccess() {
    setShowCreate(false);
    fetchOrganizations();
    toast.success(t("createSuccess"));
  }

  async function handleDelete(org: Organization) {
    const confirmed = await confirm({
      title: t("deleteOrg"),
      description: (
        <>
          {t("confirmDelete")} <strong>{org.name}</strong>?
        </>
      ),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;

    try {
      await withApiFeedback(appClient.api.organizations[":id"].$delete)({
        param: { id: org.id },
      });
      fetchOrganizations();
      toast.success(t("deleteSuccess"));
    } catch {
      // Error handled by withApiFeedback
    }
  }

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={organizations.length === 0}
        emptyMessage={t("noOrgs")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        toolbar={
          <div className="flex w-full justify-end">
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              {t("addOrg")}
            </Button>
          </div>
        }
      >
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("slug")}</TableHead>
            <TableHead>{t("logo")}</TableHead>
            <TableHead>{t("createdAt")}</TableHead>
            <TableHead sticky="right" align="right">
              {t("actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {organizations.map((org) => (
            <TableRow key={org.id}>
              <TableCell>{org.name}</TableCell>
              <TableCell>{org.slug}</TableCell>
              <TableCell>
                {org.logo ? (
                  <Image
                    src={org.logo}
                    alt={org.name}
                    width={24}
                    height={24}
                    className="rounded"
                    unoptimized
                  />
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>{formatDate(org.createdAt)}</TableCell>
              <TableCell sticky="right" align="right">
                <ButtonGroup className="ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditOrg(org)}
                  >
                    <Pencil />
                    {t("edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(org)}
                  >
                    <Trash2 />
                    {t("delete")}
                  </Button>
                </ButtonGroup>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>

      {showCreate && (
        <OrganizationDialog
          open={showCreate}
          onOpenChange={(open) => !open && setShowCreate(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {editOrg && (
        <OrganizationDialog
          organization={editOrg}
          open={!!editOrg}
          onOpenChange={(open) => !open && setEditOrg(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </>
  );
}
