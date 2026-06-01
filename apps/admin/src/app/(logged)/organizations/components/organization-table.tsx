"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { DataTablePagination } from "@/components/data-table-pagination";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePaginatedApiQuery } from "@/hooks/use-paginated-api-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
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
  const [showCreate, setShowCreate] = useState(false);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [deleteOrg, setDeleteOrg] = useState<Organization | null>(null);

  const fetchOrganizationsPage = useCallback(
    async ({ limit, offset }: { limit: number; offset: number }) => {
      const res = await withApiFeedback(appClient.api.organizations.$get)({
        query: { limit, offset },
      });
      const data = await res.json();
      return { items: data.organizations, total: data.total };
    },
    [],
  );

  const {
    items: organizations,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh: fetchOrganizations,
  } = usePaginatedApiQuery<Organization>({ fetchPage: fetchOrganizationsPage });

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

  function handleDeleteSuccess() {
    setDeleteOrg(null);
    fetchOrganizations();
    toast.success(t("deleteSuccess"));
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (organizations.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-4 flex shrink-0 justify-end">
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("addOrg")}
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center py-8 text-center text-muted-foreground">
          {t("noOrgs")}
        </div>
        {showCreate && (
          <OrganizationDialog
            open={showCreate}
            onOpenChange={(open) => !open && setShowCreate(false)}
            onSuccess={handleCreateSuccess}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 justify-end">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addOrg")}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <Table containerClassName="min-h-0 flex-1 overflow-auto rounded-md border">
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
                    />
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>{formatDate(org.createdAt)}</TableCell>
                <TableCell sticky="right" align="right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditOrg(org)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteOrg(org)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {total > pageSize && (
          <DataTablePagination
            className="shrink-0"
            page={page}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        )}
      </div>

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

      {deleteOrg && (
        <DeleteConfirmDialog
          organization={deleteOrg}
          open={!!deleteOrg}
          onOpenChange={(open) => !open && setDeleteOrg(null)}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </div>
  );
}
