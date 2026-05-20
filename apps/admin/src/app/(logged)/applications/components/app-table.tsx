"use client";

import { Pencil, Plus, Search, Trash2, TreePine } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { AppDialog } from "./app-dialog";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

interface Application {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  logo?: string | null;
  sortOrder: number;
  createdAt: string;
}

export function AppTable() {
  const t = useTranslations("Applications");
  const [applications, setApplications] = useState<Application[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editApp, setEditApp] = useState<Application | null>(null);
  const [deleteApp, setDeleteApp] = useState<Application | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const pageSize = 10;
  const offset = (page - 1) * pageSize;
  const totalPages = Math.ceil(total / pageSize);

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await appClient.api.applications.$get({
        query: {
          limit: pageSize,
          offset,
          search: debouncedSearch || undefined,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications);
        setTotal(data.total);
      }
    } catch {
      toast.error(t("fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [offset, debouncedSearch, t]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  function handleEditSuccess() {
    setEditApp(null);
    fetchApplications();
    toast.success(t("updateSuccess"));
  }

  function handleCreateSuccess() {
    setShowCreate(false);
    fetchApplications();
    toast.success(t("createSuccess"));
  }

  function handleDeleteSuccess() {
    setDeleteApp(null);
    fetchApplications();
    toast.success(t("deleteSuccess"));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addApp")}
        </Button>
      </div>

      {applications.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          {t("noApps")}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("code")}</TableHead>
                <TableHead>{t("description_label")}</TableHead>
                <TableHead>{t("logo")}</TableHead>
                <TableHead>{t("createdAt")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((app) => (
                <TableRow key={app.id}>
                  <TableCell>{app.name}</TableCell>
                  <TableCell>{app.code}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {app.description || "-"}
                  </TableCell>
                  <TableCell>
                    {app.logo ? (
                      <Image
                        src={app.logo}
                        alt={app.name}
                        width={24}
                        height={24}
                        className="rounded"
                        unoptimized
                      />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(app.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      render={<Link href={`/applications/${app.id}/menus`} />}
                    >
                      <TreePine className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditApp(app)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteApp(app)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between py-4">
              <p className="text-sm text-muted-foreground">
                {t("showing")} {offset + 1}-{Math.min(offset + pageSize, total)}{" "}
                {t("of")} {total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  {t("previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  {t("next")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {showCreate && (
        <AppDialog
          open={showCreate}
          onOpenChange={(open) => !open && setShowCreate(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {editApp && (
        <AppDialog
          app={editApp}
          open={!!editApp}
          onOpenChange={(open) => !open && setEditApp(null)}
          onSuccess={handleEditSuccess}
        />
      )}

      {deleteApp && (
        <DeleteConfirmDialog
          app={deleteApp}
          open={!!deleteApp}
          onOpenChange={(open) => !open && setDeleteApp(null)}
          onSuccess={handleDeleteSuccess}
        />
      )}
    </>
  );
}
