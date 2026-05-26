import { format } from "date-fns";

type DateInput = Date | string | number;

export function formatDate(value: DateInput) {
  return format(value, "yyyy-MM-dd");
}

export function formatDateTime(value: DateInput) {
  return format(value, "yyyy-MM-dd HH:mm:ss");
}
