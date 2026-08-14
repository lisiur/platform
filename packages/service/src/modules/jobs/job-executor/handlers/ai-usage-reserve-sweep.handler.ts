import type { JobHandler } from "#lib/queues/job.types";
import { sweepStaleAiUsageReservations } from "#modules/billing/billing.service";

const STALE_AFTER_HOURS = 2;
const MS_PER_HOUR = 60 * 60 * 1000;

export const aiUsageReserveSweepHandler: JobHandler = async () => {
  return sweepStaleAiUsageReservations(
    new Date(Date.now() - STALE_AFTER_HOURS * MS_PER_HOUR),
  );
};
