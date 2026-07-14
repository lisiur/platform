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
    filtersButton: string;
    filtersTitle: string;
    apply: string;
  };
}

interface UploadFilterFieldsProps {
  filters: UploadFilters;
  setFilter: (key: keyof UploadFilters, value: string) => void;
  handleDateChange: (range: DateRange | undefined) => void;
  labels: UploadFilterProps["labels"];
  resetKey: number;
}

function UploadFilterFields({
  filters,
  setFilter,
  handleDateChange,
  labels,
  resetKey,
}: UploadFilterFieldsProps) {
  return (
    <>
      <Select
        value={filters.visibility ?? "all"}
        onValueChange={(value) =>
          setFilter("visibility", !value || value === "all" ? "" : value)
        }
      >
        <SelectTrigger className="h-9 w-full md:w-36">
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
        className="h-9 w-full md:w-40"
        placeholder={labels.mimeType}
        value={filters.mimeType ?? ""}
        onChange={(event) => setFilter("mimeType", event.target.value)}
      />
      <Input
        className="h-9 w-full md:w-48"
        placeholder={labels.uploader}
        value={filters.uploader ?? ""}
        onChange={(event) => setFilter("uploader", event.target.value)}
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

export function UploadFilter({
  filters,
  onFiltersChange,
  labels,
}: UploadFilterProps) {
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

  function setFilter(key: keyof UploadFilters, value: string) {
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
              <UploadFilterFields
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
      <UploadFilterFields
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
