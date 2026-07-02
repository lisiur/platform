"use client";

import { PaginatedTableFrame } from "@repo/frontend";
import {
  Badge,
  Button,
  ButtonGroup,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui";
import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useState } from "react";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDateTime } from "@/utils/date";
import {
  NotificationRecordFilter,
  type NotificationRecordFilters,
} from "./notification-record-filter";
import type { NotificationRecord, NotificationRecordListItem } from "./types";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  sent: "secondary",
  pending: "outline",
  failed: "destructive",
};

function formatOptionalDate(value?: string | null) {
  return value ? formatDateTime(value) : "-";
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  const displayValue =
    value === null || value === undefined || value === "" ? "-" : value;

  return (
    <div className="grid gap-1 border-b py-2 last:border-b-0 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{displayValue}</dd>
    </div>
  );
}

export function NotificationRecordTable() {
  const t = useTranslations("Notifications");
  const [filters, setFilters] = useState<NotificationRecordFilters>({
    archivedState: "active",
  });
  const [detailRecord, setDetailRecord] = useState<NotificationRecord | null>(
    null,
  );
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  const {
    items: records,
    total,
    page,
    pageSize,
    loading,
    setPage,
  } = usePaginatedQuery<NotificationRecordListItem>({
    queryKey: ["notification-records", filters],
    pageSize: 20,
    queryFn: async ({ limit, offset }) => {
      const query: Record<string, string | number> = { limit, offset };
      if (filters.recipientEmail) query.recipientEmail = filters.recipientEmail;
      if (filters.recipientName) query.recipientName = filters.recipientName;
      if (filters.status) query.status = filters.status;
      if (filters.providerKey) query.providerKey = filters.providerKey;
      if (filters.readState) query.readState = filters.readState;
      if (filters.archivedState) query.archivedState = filters.archivedState;
      if (filters.startDate) query.startDate = filters.startDate.toISOString();
      if (filters.endDate) query.endDate = filters.endDate.toISOString();

      const res = await withApiFeedback(
        appClient.api["notification-records"].$get,
      )({ query });
      const data = await res.json();
      return { items: data.records, total: data.total };
    },
  });

  function handleFiltersChange(
    newFiltersOrFn:
      | NotificationRecordFilters
      | ((prev: NotificationRecordFilters) => NotificationRecordFilters),
  ) {
    setFilters(newFiltersOrFn);
    setPage(1);
  }

  async function handleViewRecord(id: string) {
    setLoadingDetailId(id);
    try {
      const res = await withApiFeedback(
        appClient.api["notification-records"][":id"].$get,
      )({ param: { id } });
      const data = await res.json();
      setDetailRecord(data as NotificationRecord);
    } catch {
      // Error handled by API feedback.
    } finally {
      setLoadingDetailId(null);
    }
  }

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={records.length === 0}
        emptyMessage={t("records.empty")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        toolbar={
          <NotificationRecordFilter
            filters={filters}
            onFiltersChange={handleFiltersChange}
            labels={{
              recipientEmail: t("records.filters.recipientEmail"),
              recipientName: t("records.filters.recipientName"),
              status: t("records.filters.status"),
              provider: t("fields.provider"),
              allProviders: t("records.filters.allProviders"),
              readState: t("records.filters.readState"),
              allReadStates: t("records.filters.allReadStates"),
              read: t("records.readState.read"),
              unread: t("records.readState.unread"),
              archivedState: t("records.filters.archivedState"),
              active: t("records.archivedState.active"),
              archived: t("records.archivedState.archived"),
              allArchivedStates: t("records.archivedState.all"),
              clear: t("records.filters.clear"),
            }}
          />
        }
      >
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t("records.columns.recipient")}</TableHead>
            <TableHead>{t("records.columns.notification")}</TableHead>
            <TableHead>{t("fields.channel")}</TableHead>
            <TableHead>{t("fields.provider")}</TableHead>
            <TableHead>{t("fields.status")}</TableHead>
            <TableHead>{t("records.columns.readState")}</TableHead>
            <TableHead>{t("fields.createdAt")}</TableHead>
            <TableHead sticky="right" align="right">
              {t("fields.actions")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id}>
              <TableCell>
                <div className="font-medium">{record.recipient.name}</div>
                <div className="text-muted-foreground text-xs">
                  {record.recipient.email}
                </div>
              </TableCell>
              <TableCell className="max-w-80">
                <div className="truncate font-medium">
                  {record.renderedTitle || record.renderedSubject || "-"}
                </div>
                <div className="text-muted-foreground text-xs">
                  {record.template.name}
                </div>
                <div className="mt-1 font-mono text-muted-foreground text-[10px]">
                  {record.template.key}
                </div>
              </TableCell>
              <TableCell>{record.channel.name}</TableCell>
              <TableCell className="font-mono text-xs">
                {record.channel.providerKey}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[record.status] ?? "outline"}>
                  {record.status}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={record.readAt ? "outline" : "secondary"}>
                  {record.readAt
                    ? t("records.readState.read")
                    : t("records.readState.unread")}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDateTime(record.createdAt)}
              </TableCell>
              <TableCell sticky="right" align="right">
                <ButtonGroup className="ml-auto">
                  {loadingDetailId === record.id ? (
                    <Button variant="ghost" size="icon-sm" disabled>
                      <Eye />
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("records.view")}
                            onClick={() => handleViewRecord(record.id)}
                          >
                            <Eye />
                          </Button>
                        }
                      />
                      <TooltipContent>{t("records.view")}</TooltipContent>
                    </Tooltip>
                  )}
                </ButtonGroup>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>

      <Sheet
        open={!!detailRecord}
        onOpenChange={(open) => !open && setDetailRecord(null)}
      >
        <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{t("records.detailTitle")}</SheetTitle>
            <SheetDescription>{detailRecord?.id}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            {detailRecord && (
              <div className="space-y-6">
                <section>
                  <h3 className="mb-2 font-medium text-sm">
                    {t("records.sections.content")}
                  </h3>
                  <dl className="rounded-md border px-3">
                    <DetailRow
                      label={t("records.detail.subject")}
                      value={detailRecord.renderedSubject}
                    />
                    <DetailRow
                      label={t("records.detail.title")}
                      value={detailRecord.renderedTitle}
                    />
                    <DetailRow
                      label={t("records.detail.body")}
                      value={detailRecord.renderedBody}
                    />
                  </dl>
                </section>
                <section>
                  <h3 className="mb-2 font-medium text-sm">
                    {t("records.sections.routing")}
                  </h3>
                  <dl className="rounded-md border px-3">
                    <DetailRow
                      label={t("records.columns.recipient")}
                      value={`${detailRecord.recipient.name} <${detailRecord.recipient.email}>`}
                    />
                    <DetailRow
                      label={t("records.detail.template")}
                      value={`${detailRecord.template.name} (${detailRecord.template.key})`}
                    />
                    <DetailRow
                      label={t("fields.channel")}
                      value={`${detailRecord.channel.name} (${detailRecord.channel.key})`}
                    />
                    <DetailRow
                      label={t("fields.provider")}
                      value={detailRecord.channel.providerKey}
                    />
                    <DetailRow
                      label={t("records.detail.source")}
                      value={detailRecord.source}
                    />
                    <DetailRow
                      label={t("records.detail.correlationId")}
                      value={detailRecord.correlationId}
                    />
                  </dl>
                </section>
                <section>
                  <h3 className="mb-2 font-medium text-sm">
                    {t("records.sections.delivery")}
                  </h3>
                  <dl className="rounded-md border px-3">
                    <DetailRow
                      label={t("fields.status")}
                      value={detailRecord.status}
                    />
                    <DetailRow
                      label={t("records.detail.attempts")}
                      value={detailRecord.attempts}
                    />
                    <DetailRow
                      label={t("records.detail.providerMessageId")}
                      value={detailRecord.providerMessageId}
                    />
                    <DetailRow
                      label={t("records.detail.errorMessage")}
                      value={detailRecord.errorMessage}
                    />
                    <DetailRow
                      label={t("records.detail.nextAttemptAt")}
                      value={formatOptionalDate(detailRecord.nextAttemptAt)}
                    />
                    <DetailRow
                      label={t("records.detail.sentAt")}
                      value={formatOptionalDate(detailRecord.sentAt)}
                    />
                    <DetailRow
                      label={t("records.detail.failedAt")}
                      value={formatOptionalDate(detailRecord.failedAt)}
                    />
                    <DetailRow
                      label={t("records.detail.readAt")}
                      value={formatOptionalDate(detailRecord.readAt)}
                    />
                    <DetailRow
                      label={t("records.detail.archivedAt")}
                      value={formatOptionalDate(detailRecord.archivedAt)}
                    />
                    <DetailRow
                      label={t("fields.createdAt")}
                      value={formatDateTime(detailRecord.createdAt)}
                    />
                  </dl>
                </section>
                <section>
                  <h3 className="mb-2 font-medium text-sm">
                    {t("records.sections.data")}
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 text-muted-foreground text-sm">
                        {t("records.detail.variables")}
                      </div>
                      <JsonBlock value={detailRecord.variables} />
                    </div>
                    <div>
                      <div className="mb-1 text-muted-foreground text-sm">
                        {t("records.detail.metadata")}
                      </div>
                      <JsonBlock value={detailRecord.metadata} />
                    </div>
                  </div>
                </section>
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
