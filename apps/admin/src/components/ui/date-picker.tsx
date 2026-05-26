"use client";

import { CalendarIcon } from "lucide-react";
import * as React from "react";
import type { DateRange, OnSelectHandler } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/cn";
import { formatDate } from "@/utils/date";

function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
}: {
  value?: Date | null;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            data-empty={!value}
            className={cn(
              "w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarIcon />
        {value ? formatDate(value) : <span>{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(day) => {
            onChange?.(day);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function DateRangePicker({
  startDate,
  endDate,
  onChange,
  className,
}: {
  startDate?: Date | null;
  endDate?: Date | null;
  onChange?: (range: DateRange | undefined) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState<DateRange | undefined>(
    startDate && endDate ? { from: startDate, to: endDate } : undefined,
  );

  const handleSelect: OnSelectHandler<DateRange | undefined> = (
    nextRange,
    selectedDay,
  ) => {
    let result: DateRange | undefined;
    setDate((range) => {
      if (range?.from && !nextRange) {
        result = { from: selectedDay, to: selectedDay };
      } else if (range?.from && range?.to) {
        result = { from: selectedDay };
      } else {
        result = nextRange;
      }
      return result;
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          onChange?.(date);
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            data-empty={!date?.from}
            className={cn(
              "w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarIcon />
        {date?.from ? (
          date.to ? (
            <>
              {formatDate(date.from)} - {formatDate(date.to)}
            </>
          ) : (
            formatDate(date.from)
          )
        ) : (
          <span>Pick a date range</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          required={false}
          defaultMonth={date?.from}
          selected={date}
          onSelect={handleSelect}
          numberOfMonths={2}
          min={1}
        />
      </PopoverContent>
    </Popover>
  );
}

export { DatePicker, DateRangePicker };
