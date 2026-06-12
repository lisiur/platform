"use client";

import {
  DateRangePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@repo/ui";
import { useCallback, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";

const SEVERITY_OPTIONS = ["info", "warning", "critical"] as const;
const OUTCOME_OPTIONS = ["success", "failure", "denied"] as const;

export interface AuditLogFilters {
  traceId?: string;
  sessionId?: string;
  userId?: string;
  userName?: string;
  event?: string;
  category?: string;
  severity?: string;
  outcome?: string;
  targetType?: string;
  targetId?: string;
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
    sessionId: string;
    userName: string;
    event: string;
    category: string;
    targetType: string;
    allSeverities: string;
    allOutcomes: string;
    clear: string;
  };
}

export function AuditLogFilter({
  filters,
  onFiltersChange,
  labels,
}: AuditLogFilterProps) {
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

  function setFilter(key: keyof AuditLogFilters, value: string) {
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
      <Input
        className="h-9 w-40"
        placeholder={labels.userName}
        value={filters.userName ?? ""}
        onChange={(event) => setFilter("userName", event.target.value)}
      />
      <Input
        className="h-9 w-44"
        placeholder={labels.event}
        value={filters.event ?? ""}
        onChange={(event) => setFilter("event", event.target.value)}
      />
      <Input
        className="h-9 w-40"
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
        <SelectTrigger className="h-9 w-40">
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
        <SelectTrigger className="h-9 w-40">
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
      <Input
        className="h-9 w-36"
        placeholder={labels.targetType}
        value={filters.targetType ?? ""}
        onChange={(event) => setFilter("targetType", event.target.value)}
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
