type DateInput = Date | string | number;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatDate(value: DateInput) {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTime(value: DateInput) {
  const d = new Date(value);
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatTimeUntil(value: DateInput): string {
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "now";
  const totalSeconds = Math.floor(diff / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}m${s}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const h = totalHours % 24;
  const d = Math.floor(totalHours / 24);
  if (d > 0) return `${d}d${h}h${m}m`;
  return `${h}h${m}m`;
}

/**
 * Returns a compact, locale-neutral relative time for recent dates
 * (e.g. "5m", "3h", "2d"). Returns `null` when the timestamp is less
 * than a minute old so callers can render a translated "just now".
 */
export function formatRelativeTime(value: DateInput): string | null {
  const d = new Date(value);
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

  return formatDate(d);
}
