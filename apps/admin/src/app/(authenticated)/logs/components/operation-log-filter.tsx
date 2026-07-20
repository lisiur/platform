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

const LEVEL_OPTIONS = ["debug", "info", "warn", "error"] as const;
const AUTH_TYPE_OPTIONS = ["session", "api_token"] as const;

export interface OperationLogFilters {
  traceId?: string;
  authType?: string;
  authTokenId?: string;
  level?: string;
  module?: string;
  event?: string;
  path?: string;
  statusCode?: string;
  startDate?: Date;
  endDate?: Date;
}

interface OperationLogFilterProps {
  filters: OperationLogFilters;
  onFiltersChange: (
    newFiltersOrFn:
      | OperationLogFilters
      | ((prev: OperationLogFilters) => OperationLogFilters),
  ) => void;
  labels: {
    traceId: string;
    authTokenId: string;
    level: string;
    module: string;
    event: string;
    path: string;
    statusCode: string;
    allLevels: string;
    allAuthTypes: string;
    clear: string;
    filtersButton: string;
    filtersTitle: string;
    apply: string;
  };
}

interface OperationLogFilterFieldsProps {
  filters: OperationLogFilters;
  setFilter: (key: keyof OperationLogFilters, value: string) => void;
  handleDateChange: (range: DateRange | undefined) => void;
  labels: OperationLogFilterProps["labels"];
  resetKey: number;
}

function OperationLogFilterFields({
  filters,
  setFilter,
  handleDateChange,
  labels,
  resetKey,
}: OperationLogFilterFieldsProps) {
  return (
    <>
      <Input
        className="h-9 w-full md:w-48"
        placeholder={labels.traceId}
        value={filters.traceId ?? ""}
        onChange={(event) => setFilter("traceId", event.target.value)}
      />
      <Select
        value={filters.authType ?? "all"}
        onValueChange={(value) =>
          setFilter("authType", !value || value === "all" ? "" : value)
        }
      >
        <SelectTrigger className="h-9 w-full md:w-40">
          {filters.authType ?? labels.allAuthTypes}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{labels.allAuthTypes}</SelectItem>
          {AUTH_TYPE_OPTIONS.map((authType) => (
            <SelectItem key={authType} value={authType}>
              {authType}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-9 w-full md:w-48"
        placeholder={labels.authTokenId}
        value={filters.authTokenId ?? ""}
        onChange={(event) => setFilter("authTokenId", event.target.value)}
      />
      <Select
        value={filters.level ?? "all"}
        onValueChange={(value) =>
          setFilter("level", !value || value === "all" ? "" : value)
        }
      >
        <SelectTrigger className="h-9 w-full md:w-36">
          {filters.level ? filters.level.toUpperCase() : labels.allLevels}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{labels.allLevels}</SelectItem>
          {LEVEL_OPTIONS.map((level) => (
            <SelectItem key={level} value={level}>
              {level.toUpperCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-9 w-full md:w-36"
        placeholder={labels.module}
        value={filters.module ?? ""}
        onChange={(event) => setFilter("module", event.target.value)}
      />
      <Input
        className="h-9 w-full md:w-40"
        placeholder={labels.event}
        value={filters.event ?? ""}
        onChange={(event) => setFilter("event", event.target.value)}
      />
      <Input
        className="h-9 w-full md:w-44"
        placeholder={labels.path}
        value={filters.path ?? ""}
        onChange={(event) => setFilter("path", event.target.value)}
      />
      <Input
        className="h-9 w-full md:w-28"
        placeholder={labels.statusCode}
        value={filters.statusCode ?? ""}
        onChange={(event) => setFilter("statusCode", event.target.value)}
      />
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

export function OperationLogFilter({
  filters,
  onFiltersChange,
  labels,
}: OperationLogFilterProps) {
  const onFiltersChangeRef = useRef(onFiltersChange);
  onFiltersChangeRef.current = onFiltersChange;
  const [resetKey, setResetKey] = useState(0);
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const hasFilters = Object.values(filters).some(Boolean);
  const activeCount = Object.values(filters).filter(Boolean).length;

  const handleDateChange = useCallback((range: DateRange | undefined) => {
    onFiltersChangeRef.current((prev) => ({
      ...prev,
      startDate: range?.from,
      endDate: range?.to,
    }));
  }, []);

  function setFilter(key: keyof OperationLogFilters, value: string) {
    onFiltersChange({ ...filters, [key]: value || undefined });
  }

  function handleClear() {
    setResetKey((key) => key + 1);
    onFiltersChange({});
  }

  if (isMobile) {
    return (
      <>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" />
            {labels.filtersButton}
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeCount}
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
              <OperationLogFilterFields
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
      <OperationLogFilterFields
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
