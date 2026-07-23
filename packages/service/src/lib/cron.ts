import { Cron } from "croner";

export function validateCron(expression: string): boolean {
  try {
    new Cron(expression);
    return true;
  } catch {
    return false;
  }
}

export function nextRunFromNow(
  expression: string,
  from: Date = new Date(),
): Date {
  const cron = new Cron(expression);
  const next = cron.nextRun(from);
  return next ?? new Date(from.getTime() + 60 * 60 * 1000);
}
