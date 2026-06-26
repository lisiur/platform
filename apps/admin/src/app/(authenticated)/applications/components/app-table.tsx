"use client";

import {
  Button,
  ButtonGroup,
  Input,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui";
import { Pencil, Search, Settings } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PaginatedTableFrame } from "@/components/paginated-table-frame";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
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

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const {
    items: applications,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh: fetchApplications,
  } = usePaginatedQuery<Application>({
    queryKey: ["applications", { search: debouncedSearch || undefined }],
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(appClient.api.applications.$get)({
        query: { limit, offset, search: debouncedSearch || undefined },
      });
      const data = await res.json();
      return { items: data.applications, total: data.total };
    },
  });

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

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={applications.length === 0}
        emptyMessage={t("noApps")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        toolbar={
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("search")}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
        }
      >
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
                <ButtonGroup className="ml-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/applications/${app.id}`)}
                  >
                    <Settings />
                    {t("settings")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditApp(app)}
                  >
                    <Pencil />
                    {t("edit")}
                  </Button>
                </ButtonGroup>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>

      {editApp && (
        <AppDialog
          app={editApp}
          open={!!editApp}
          onOpenChange={(open) => !open && setEditApp(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </>
  );
}
