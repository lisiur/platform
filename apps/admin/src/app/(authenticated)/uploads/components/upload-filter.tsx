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

export interface UploadFilters {
  visibility?: string;
  mimeType?: string;
  uploader?: string;
  startDate?: Date;
  endDate?: Date;
}

const VISIBILITY_OPTIONS = ["public", "private"] as const;

interface UploadFilterProps {
  filters: UploadFilters;
  onFiltersChange: (
    newFiltersOrFn: UploadFilters | ((prev: UploadFilters) => UploadFilters),
  ) => void;
  labels: {
    mimeType: string;
    uploader: string;
    allVisibility: string;
    clear: string;
  };
}

export function UploadFilter({
  filters,
  onFiltersChange,
  labels,
}: UploadFilterProps) {
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

  function setFilter(key: keyof UploadFilters, value: string) {
    onFiltersChange({ ...filters, [key]: value || undefined });
  }

  function handleClear() {
    setResetKey((key) => key + 1);
    onFiltersChange({});
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filters.visibility ?? "all"}
        onValueChange={(value) =>
          setFilter("visibility", !value || value === "all" ? "" : value)
        }
      >
        <SelectTrigger className="h-9 w-36">
          {filters.visibility ?? labels.allVisibility}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{labels.allVisibility}</SelectItem>
          {VISIBILITY_OPTIONS.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-9 w-40"
        placeholder={labels.mimeType}
        value={filters.mimeType ?? ""}
        onChange={(event) => setFilter("mimeType", event.target.value)}
      />
      <Input
        className="h-9 w-48"
        placeholder={labels.uploader}
        value={filters.uploader ?? ""}
        onChange={(event) => setFilter("uploader", event.target.value)}
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
