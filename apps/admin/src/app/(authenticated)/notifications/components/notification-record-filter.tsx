"use client";

import {
  Badge,
  Button,
  DateRangePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from "@repo/ui";
import { SlidersHorizontal } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";

export interface NotificationRecordFilters {
  recipientEmail?: string;
  recipientName?: string;
  status?: string;
  providerKey?: string;
  readState?: "all" | "read" | "unread";
  archivedState?: "all" | "active" | "archived";
  startDate?: Date;
  endDate?: Date;
}

interface NotificationRecordFilterProps {
  filters: NotificationRecordFilters;
  onFiltersChange: (
    newFiltersOrFn:
      | NotificationRecordFilters
      | ((prev: NotificationRecordFilters) => NotificationRecordFilters),
  ) => void;
  labels: {
    recipientEmail: string;
    recipientName: string;
    status: string;
    provider: string;
    allProviders: string;
    readState: string;
    allReadStates: string;
    read: string;
    unread: string;
    archivedState: string;
    active: string;
    archived: string;
    allArchivedStates: string;
    clear: string;
    filtersButton: string;
    filtersTitle: string;
    apply: string;
  };
}

const PROVIDER_OPTIONS = ["in-app", "smtp-email", "sms"] as const;

interface NotificationRecordFilterFieldsProps {
  filters: NotificationRecordFilters;
  setFilter: (key: keyof NotificationRecordFilters, value: string) => void;
  handleDateChange: (range: DateRange | undefined) => void;
  labels: NotificationRecordFilterProps["labels"];
  resetKey: number;
}

function NotificationRecordFilterFields({
  filters,
  setFilter,
  handleDateChange,
  labels,
  resetKey,
}: NotificationRecordFilterFieldsProps) {
  return (
    <>
      <Input
        className="h-9 w-full md:w-48"
        placeholder={labels.recipientEmail}
        value={filters.recipientEmail ?? ""}
        onChange={(event) => setFilter("recipientEmail", event.target.value)}
      />
      <Input
        className="h-9 w-full md:w-40"
        placeholder={labels.recipientName}
        value={filters.recipientName ?? ""}
        onChange={(event) => setFilter("recipientName", event.target.value)}
      />
      <Input
        className="h-9 w-full md:w-32"
        placeholder={labels.status}
        value={filters.status ?? ""}
        onChange={(event) => setFilter("status", event.target.value)}
      />
      <Select
        value={filters.providerKey ?? "all"}
        onValueChange={(value) =>
          setFilter("providerKey", !value || value === "all" ? "" : value)
        }
      >
        <SelectTrigger className="h-9 w-full md:w-40">
          {filters.providerKey ?? labels.allProviders}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{labels.allProviders}</SelectItem>
          {PROVIDER_OPTIONS.map((provider) => (
            <SelectItem key={provider} value={provider}>
              {provider}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.readState ?? "all"}
        onValueChange={(value) =>
          setFilter("readState", !value || value === "all" ? "" : value)
        }
      >
        <SelectTrigger className="h-9 w-full md:w-36">
          {filters.readState === "read"
            ? labels.read
            : filters.readState === "unread"
              ? labels.unread
              : labels.allReadStates}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{labels.allReadStates}</SelectItem>
          <SelectItem value="read">{labels.read}</SelectItem>
          <SelectItem value="unread">{labels.unread}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.archivedState ?? "active"}
        onValueChange={(value) =>
          setFilter("archivedState", !value || value === "active" ? "" : value)
        }
      >
        <SelectTrigger className="h-9 w-full md:w-40">
          {filters.archivedState === "all"
            ? labels.allArchivedStates
            : filters.archivedState === "archived"
              ? labels.archived
              : labels.active}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">{labels.active}</SelectItem>
          <SelectItem value="archived">{labels.archived}</SelectItem>
          <SelectItem value="all">{labels.allArchivedStates}</SelectItem>
        </SelectContent>
      </Select>
      <DateRangePicker
        key={resetKey}
        startDate={filters.startDate ?? null}
        endDate={filters.endDate ?? null}
        onChange={handleDateChange}
        className="w-full md:w-auto"
      />
    </>
  );
}

export function NotificationRecordFilter({
  filters,
  onFiltersChange,
  labels,
}: NotificationRecordFilterProps) {
  const onFiltersChangeRef = useRef(onFiltersChange);
  onFiltersChangeRef.current = onFiltersChange;
  const [resetKey, setResetKey] = useState(0);
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const activeFilters = Object.values(filters).filter(
    (value) => value && value !== "all" && value !== "active",
  );
  const hasFilters = activeFilters.length > 0;

  const handleDateChange = useCallback((range: DateRange | undefined) => {
    onFiltersChangeRef.current((prev) => ({
      ...prev,
      startDate: range?.from,
      endDate: range?.to,
    }));
  }, []);

  function setFilter(key: keyof NotificationRecordFilters, value: string) {
    onFiltersChange({ ...filters, [key]: value || undefined });
  }

  function handleClear() {
    setResetKey((key) => key + 1);
    onFiltersChange({ archivedState: "active" });
  }

  if (isMobile) {
    return (
      <>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" />
            {labels.filtersButton}
            {hasFilters && (
              <Badge variant="secondary" className="ml-1">
                {activeFilters.length}
              </Badge>
            )}
          </Button>
          {hasFilters && (
            <button
              type="button"
              className="text-muted-foreground text-sm hover:text-foreground"
              onClick={handleClear}
            >
              {labels.clear}
            </button>
          )}
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>{labels.filtersTitle}</SheetTitle>
            </SheetHeader>
            <SheetBody>
              <NotificationRecordFilterFields
                filters={filters}
                setFilter={setFilter}
                handleDateChange={handleDateChange}
                labels={labels}
                resetKey={resetKey}
              />
            </SheetBody>
            <SheetFooter>
              {hasFilters && (
                <Button variant="ghost" onClick={handleClear}>
                  {labels.clear}
                </Button>
              )}
              <Button onClick={() => setOpen(false)}>{labels.apply}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NotificationRecordFilterFields
        filters={filters}
        setFilter={setFilter}
        handleDateChange={handleDateChange}
        labels={labels}
        resetKey={resetKey}
      />
      {hasFilters && (
        <button
          type="button"
          className="text-muted-foreground text-sm hover:text-foreground"
          onClick={handleClear}
        >
          {labels.clear}
        </button>
      )}
    </div>
  );
}
