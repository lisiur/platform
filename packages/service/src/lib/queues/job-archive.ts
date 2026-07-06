import { jobRepository } from "#repositories/job.repository";
import type { Job } from "./job.types";

export class JobArchiver {
  async archive(job: Job): Promise<void> {
    await jobRepository.archiveAndDelete(job);
  }
}

export const jobArchiver = new JobArchiver();
