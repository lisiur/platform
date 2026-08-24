export { formatDate, formatDateTime, formatRelativeTime } from "@repo/frontend";

// Entry dates are stored at UTC midnight, so window boundaries must be UTC
// instants built from the picked YYYY-MM-DD — local-timezone Dates skew the
// window by up to a day for non-UTC users.
export function startOfUtcDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

export function endOfUtcDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999Z`);
}
