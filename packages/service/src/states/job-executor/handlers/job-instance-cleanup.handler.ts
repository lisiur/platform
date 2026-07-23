import type { JobHandler } from "#lib/queues/job.types";
import { jobInstanceRepository } from "#repositories/job-instance.repository";

const RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const jobInstanceCleanupHandler: JobHandler = async () => {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY);
  const deleted = await jobInstanceRepository.deleteManyTerminal(cutoff);
  return { deleted, retentionDays: RETENTION_DAYS };
};
