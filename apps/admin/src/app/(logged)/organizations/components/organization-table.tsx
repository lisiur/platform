"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
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
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [deleteOrg, setDeleteOrg] = useState<Organization | null>(null);

  const pageSize = 10;

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await withApiFeedback(appClient.api.organizations.$get)({
        query: { limit: pageSize, offset: (page - 1) * pageSize },
      });
      const data = await res.json();
      setOrganizations(data.organizations);
      setTotal(data.total);
    } catch {
      toast.error(t("fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, page]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

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
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-background">
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
