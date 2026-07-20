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

const SEVERITY_OPTIONS = ["info", "warning", "critical"] as const;
const OUTCOME_OPTIONS = ["success", "failure", "denied"] as const;
const AUTH_TYPE_OPTIONS = ["session", "api_token"] as const;

export interface AuditLogFilters {
  traceId?: string;
  authType?: string;
  authTokenId?: string;
  userId?: string;
  userName?: string;
  source?: string;
  event?: string;
  category?: string;
  severity?: string;
  outcome?: string;
  startDate?: Date;
  endDate?: Date;
}

interface AuditLogFilterProps {
  filters: AuditLogFilters;
  onFiltersChange: (
    newFiltersOrFn:
      | AuditLogFilters
      | ((prev: AuditLogFilters) => AuditLogFilters),
  ) => void;
  labels: {
    traceId: string;
    authTokenId: string;
    userName: string;
    source: string;
    event: string;
    category: string;
    allAuthTypes: string;
    allSeverities: string;
    allOutcomes: string;
    clear: string;
    filtersButton: string;
    filtersTitle: string;
    apply: string;
  };
}

interface AuditLogFilterFieldsProps {
  filters: AuditLogFilters;
  setFilter: (key: keyof AuditLogFilters, value: string) => void;
  handleDateChange: (range: DateRange | undefined) => void;
  labels: AuditLogFilterProps["labels"];
  resetKey: number;
}

function AuditLogFilterFields({
  filters,
  setFilter,
  handleDateChange,
  labels,
  resetKey,
}: AuditLogFilterFieldsProps) {
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
      <Input
        className="h-9 w-full md:w-40"
        placeholder={labels.userName}
        value={filters.userName ?? ""}
        onChange={(event) => setFilter("userName", event.target.value)}
      />
      <Input
        className="h-9 w-full md:w-56"
        placeholder={labels.source}
        value={filters.source ?? ""}
        onChange={(event) => setFilter("source", event.target.value)}
      />
      <Input
        className="h-9 w-full md:w-44"
        placeholder={labels.event}
        value={filters.event ?? ""}
        onChange={(event) => setFilter("event", event.target.value)}
      />
      <Input
        className="h-9 w-full md:w-40"
        placeholder={labels.category}
        value={filters.category ?? ""}
        onChange={(event) => setFilter("category", event.target.value)}
      />
      <Select
        value={filters.severity ?? "all"}
        onValueChange={(value) =>
          setFilter("severity", !value || value === "all" ? "" : value)
        }
      >
        <SelectTrigger className="h-9 w-full md:w-40">
          {filters.severity ?? labels.allSeverities}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{labels.allSeverities}</SelectItem>
          {SEVERITY_OPTIONS.map((severity) => (
            <SelectItem key={severity} value={severity}>
              {severity}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.outcome ?? "all"}
        onValueChange={(value) =>
          setFilter("outcome", !value || value === "all" ? "" : value)
        }
      >
        <SelectTrigger className="h-9 w-full md:w-40">
          {filters.outcome ?? labels.allOutcomes}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{labels.allOutcomes}</SelectItem>
          {OUTCOME_OPTIONS.map((outcome) => (
            <SelectItem key={outcome} value={outcome}>
              {outcome}
            </SelectItem>
          ))}
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

export function AuditLogFilter({
  filters,
  onFiltersChange,
  labels,
}: AuditLogFilterProps) {
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

  function setFilter(key: keyof AuditLogFilters, value: string) {
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
              <AuditLogFilterFields
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
      <AuditLogFilterFields
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
