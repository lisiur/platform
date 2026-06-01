"use client";

import { Pencil, Search, Settings } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
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
import { usePaginatedApiQuery } from "@/hooks/use-paginated-api-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
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
  const router = useRouter();
  const t = useTranslations("Applications");
  const [editApp, setEditApp] = useState<Application | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchApplicationsPage = useCallback(
    async ({ limit, offset }: { limit: number; offset: number }) => {
      const res = await withApiFeedback(appClient.api.applications.$get)({
        query: {
          limit,
          offset,
          search: debouncedSearch || undefined,
        },
      });
      const data = await res.json();
      return { items: data.applications, total: data.total };
    },
    [debouncedSearch],
  );

  const {
    items: applications,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh: fetchApplications,
  } = usePaginatedApiQuery<Application>({ fetchPage: fetchApplicationsPage });

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }

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
        <div className="flex min-h-0 flex-col">
          <Table containerClassName="min-h-0 flex-1 overflow-auto rounded-md border">
            <TableHeader sticky>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("code")}</TableHead>
                <TableHead>{t("description_label")}</TableHead>
                <TableHead>{t("logo")}</TableHead>
                <TableHead>{t("createdAt")}</TableHead>
                <TableHead sticky="right" align="right">
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
                  <TableCell sticky="right" align="right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => router.push(`/applications/${app.id}`)}
                    >
                      <Settings className="h-4 w-4" />
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
