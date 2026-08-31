export { formatDate, formatDateTime, formatRelativeTime } from "@repo/frontend";

// Entry dates are true UTC instants rendered in the viewer's local
// calendar, so day windows follow the LOCAL day of the picked date
// (datetime strings without a Z suffix parse as local time).
export function startOfLocalDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

export function endOfLocalDay(date: Date | string): Date {
  if (typeof date === "string") {
    return new Date(`${date}T23:59:59.999`);
  }
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}
