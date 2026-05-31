"use client";

import { useCallback, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { DateRangePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const LEVEL_OPTIONS = ["debug", "info", "warn", "error"] as const;

export interface OperationLogFilters {
  traceId?: string;
  sessionId?: string;
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
    sessionId: string;
    level: string;
    module: string;
    event: string;
    path: string;
    statusCode: string;
    allLevels: string;
    clear: string;
  };
}

export function OperationLogFilter({
  filters,
  onFiltersChange,
  labels,
}: OperationLogFilterProps) {
  const onFiltersChangeRef = useRef(onFiltersChange);
  onFiltersChangeRef.current = onFiltersChange;
  const [resetKey, setResetKey] = useState(0);

  const hasFilters = Object.values(filters).some(Boolean);

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="h-9 w-48"
        placeholder={labels.traceId}
        value={filters.traceId ?? ""}
        onChange={(event) => setFilter("traceId", event.target.value)}
      />
      <Input
        className="h-9 w-48"
        placeholder={labels.sessionId}
        value={filters.sessionId ?? ""}
        onChange={(event) => setFilter("sessionId", event.target.value)}
      />
      <Select
        value={filters.level ?? "all"}
        onValueChange={(value) =>
          setFilter("level", !value || value === "all" ? "" : value)
        }
      >
        <SelectTrigger className="h-9 w-36">
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
        className="h-9 w-36"
        placeholder={labels.module}
        value={filters.module ?? ""}
        onChange={(event) => setFilter("module", event.target.value)}
      />
      <Input
        className="h-9 w-40"
        placeholder={labels.event}
        value={filters.event ?? ""}
        onChange={(event) => setFilter("event", event.target.value)}
      />
      <Input
        className="h-9 w-44"
        placeholder={labels.path}
        value={filters.path ?? ""}
        onChange={(event) => setFilter("path", event.target.value)}
      />
      <Input
        className="h-9 w-28"
        placeholder={labels.statusCode}
        value={filters.statusCode ?? ""}
        onChange={(event) => setFilter("statusCode", event.target.value)}
      />
      <DateRangePicker
        key={resetKey}
        startDate={filters.startDate ?? null}
        endDate={filters.endDate ?? null}
        onChange={handleDateChange}
        className="w-auto"
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
