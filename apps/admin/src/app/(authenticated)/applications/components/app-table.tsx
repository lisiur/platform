"use client";

import { PaginatedTableFrame } from "@repo/frontend";
import {
  Button,
  ButtonGroup,
  Input,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui";
import { Search, Settings } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";

interface Application {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  logo?: string | null;
  favicon?: string | null;
  sortOrder: number;
  createdAt: string;
}

export function AppTable() {
  const router = useRouter();
  const t = useTranslations("Applications");
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

  return (
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
          <TableHead align="center">{t("logo")}</TableHead>
          <TableHead align="center">{t("favicon")}</TableHead>
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
            <TableCell align="center">
              {app.logo ? (
                <Image
                  src={app.logo}
                  alt={app.name}
                  width={24}
                  height={24}
                  className="mx-auto rounded"
                  unoptimized
                />
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell align="center">
              {app.favicon ? (
                <Image
                  src={app.favicon}
                  alt={app.name}
                  width={16}
                  height={16}
                  className="mx-auto object-contain"
                  unoptimized
                />
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>{formatDate(app.createdAt)}</TableCell>
            <TableCell sticky="right" align="right">
              <ButtonGroup className="ml-auto">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("settings")}
                        onClick={() => router.push(`/applications/${app.id}`)}
                      >
                        <Settings />
                      </Button>
                    }
                  />
                  <TooltipContent>{t("settings")}</TooltipContent>
                </Tooltip>
              </ButtonGroup>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </PaginatedTableFrame>
  );
}
