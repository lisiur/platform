"use client";

import { Menu, Pencil, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DataTablePagination } from "@/components/data-table-pagination";
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
import { apiWithFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";
import { AppDialog } from "./app-dialog";

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
  const [editApp, setEditApp] = useState<Application | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const pageSize = 10;

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
      const res = await apiWithFeedback(appClient.api.applications.$get)({
        query: {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          search: debouncedSearch || undefined,
        },
      });
      const data = await res.json();
      setApplications(data.applications);
      setTotal(data.total);
    } catch {
      toast.error(t("fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, t, page]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  function handleEditSuccess() {
    setEditApp(null);
    fetchApplications();
    toast.success(t("updateSuccess"));
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {applications.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-8 text-center text-muted-foreground">
          {t("noApps")}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <Table containerClassName="min-h-0 flex-1 overflow-auto rounded-md border">
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-background">
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("code")}</TableHead>
                <TableHead>{t("description_label")}</TableHead>
                <TableHead>{t("logo")}</TableHead>
                <TableHead>{t("createdAt")}</TableHead>
                <TableHead className="sticky right-0 z-30 bg-background text-right shadow-[-1px_0_0_0_var(--border)]">
                  {t("actions")}
                </TableHead>
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
                  <TableCell>{formatDate(app.createdAt)}</TableCell>
                  <TableCell className="sticky right-0 z-10 bg-background text-right shadow-[-1px_0_0_0_var(--border)]">
                    <Button
                      variant="ghost"
                      size="icon"
                      nativeButton={false}
                      render={<Link href={`/applications/${app.id}/menus`} />}
                    >
                      <Menu className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditApp(app)}
                    >
                      <Pencil className="h-4 w-4" />
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
      )}

      {editApp && (
        <AppDialog
          app={editApp}
          open={!!editApp}
          onOpenChange={(open) => !open && setEditApp(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
