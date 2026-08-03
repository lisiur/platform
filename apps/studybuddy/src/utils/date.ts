import { formatDate, formatDateTime } from "@repo/frontend";

export { formatDate, formatDateTime };

/**
 * Returns a compact, locale-neutral relative time for recent dates
 * (e.g. "5m", "3h", "2d"). Returns `null` when the timestamp is less
 * than a minute old so callers can render a translated "just now".
 */
export function formatRelativeTime(date: string | Date): string | null {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  if (Number.isNaN(d.getTime()) || diffMs < 0) return null;

  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return null;

  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;

  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;

  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;

  return formatDate(d.toISOString());
}
