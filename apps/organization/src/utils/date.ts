type DateInput = Date | string | number;

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatDate(value: DateInput) {
  return dateFormatter.format(new Date(value));
}
