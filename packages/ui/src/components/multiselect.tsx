"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";
import * as React from "react";
import { cn } from "#lib/utils";

interface MultiSelectOption {
  label: string;
  value: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
}

function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  className,
  disabled,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const selectedSet = React.useMemo(() => new Set(value), [value]);

  const toggle = (v: string) => {
    if (selectedSet.has(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  };

  const selectAll = () => {
    const visible = filtered.map((o) => o.value);
    const merged = new Set([...value, ...visible]);
    onChange(Array.from(merged));
  };

  const deselectAll = () => {
    const visible = new Set(filtered.map((o) => o.value));
    onChange(value.filter((v) => !visible.has(v)));
  };

  const selectedLabels = React.useMemo(
    () => options.filter((o) => selectedSet.has(o.value)).map((o) => o.label),
    [options, selectedSet],
  );

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(newOpen) => {
        setOpen(newOpen);
        if (!newOpen) setSearch("");
      }}
    >
      <PopoverPrimitive.Trigger
        data-slot="multiselect-trigger"
        disabled={disabled}
        className={cn(
          "flex w-full min-w-40 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm whitespace-nowrap transition-colors outline-none ring-inset h-8 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className,
        )}
      >
        <span
          data-slot="multiselect-value"
          className={cn(
            "flex flex-1 items-center gap-1 overflow-hidden",
            !selectedLabels.length && "text-muted-foreground",
          )}
        >
          {selectedLabels.length === 0
            ? placeholder
            : selectedLabels.length <= 3
              ? selectedLabels.join(", ")
              : `${selectedLabels.length} selected`}
        </span>
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          sideOffset={4}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            data-slot="multiselect-content"
            className="z-50 flex w-(--anchor-width) min-w-40 origin-(--transform-origin) flex-col gap-1 rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            <div className="flex items-center gap-1 px-1.5">
              <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                data-slot="multiselect-search"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="rounded p-0.5 hover:bg-muted"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
            <div className="border-t" />
            <div className="flex gap-1 px-1.5">
              <button
                type="button"
                onClick={selectAll}
                className="rounded px-2 py-0.5 text-xs hover:bg-muted"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="rounded px-2 py-0.5 text-xs hover:bg-muted"
              >
                Deselect all
              </button>
            </div>
            <div className="border-t" />
            <div
              data-slot="multiselect-list"
              className="max-h-60 overflow-y-auto"
            >
              {filtered.length === 0 ? (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  No results
                </div>
              ) : (
                filtered.map((option) => {
                  const isSelected = selectedSet.has(option.value);
                  return (
                    <div
                      key={option.value}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => toggle(option.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle(option.value);
                        }
                      }}
                      tabIndex={0}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent"
                    >
                      <div
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input",
                        )}
                      >
                        {isSelected && <CheckIcon className="size-3" />}
                      </div>
                      <span className="truncate">{option.label}</span>
                    </div>
                  );
                })
              )}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export type { MultiSelectOption, MultiSelectProps };
export { MultiSelect };
