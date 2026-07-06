import { jobRepository } from "#repositories/job.repository";
import { jobEvents } from "./job.events";
import type { Job } from "./job.types";
import { jobQueue } from "./job-queue";

const MAX_TIMER_DURATION_MS = 24 * 60 * 60 * 1000;

export class JobScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    jobEvents.on("job:created", (job) => this.onJobCreated(job));
  }

  async start(): Promise<void> {
    await this.loadExpiredJobs();
  }

  async loadExpiredJobs(): Promise<void> {
    let nextTimer: Date | null = null;

    while (true) {
      const jobs = await jobRepository.findPendingJobs({ limit: 1000 });

      if (jobs.length === 0) break;

      for (const job of jobs) {
        if (job.scheduledAt <= new Date()) {
          jobQueue.add(job);
        } else if (!nextTimer) {
          nextTimer = job.scheduledAt;
        }
      }

      if (jobs.length < 1000) break;
    }

    if (nextTimer) {
      this.setTimer(nextTimer);
    } else {
      await this.scheduleNext();
    }
  }

  async scheduleNext(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const nextJob = await jobRepository.findNextScheduledJob();

    if (!nextJob) {
      return;
    }

    const delay = nextJob.scheduledAt.getTime() - Date.now();

    if (delay > MAX_TIMER_DURATION_MS) {
      this.timer = setTimeout(() => this.onTimerFire(), MAX_TIMER_DURATION_MS);
    } else if (delay > 0) {
      this.timer = setTimeout(() => this.onTimerFire(), delay);
    } else {
      await this.loadExpiredJobs();
    }
  }

  private async onTimerFire(): Promise<void> {
    await this.loadExpiredJobs();
  }

  private async onJobCreated(job: Job): Promise<void> {
    if (job.scheduledAt <= new Date()) {
      jobQueue.add(job);
    }
    await this.rescheduleIfNeeded(job);
  }

  private async rescheduleIfNeeded(_job: Job): Promise<void> {
    const nextJob = await jobRepository.findNextScheduledJob();
    if (!nextJob) return;

    const delay = nextJob.scheduledAt.getTime() - Date.now();
    if (delay > 0 && delay <= MAX_TIMER_DURATION_MS) {
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = setTimeout(() => this.onTimerFire(), delay);
    }
  }

  private setTimer(targetDate: Date): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    const delay = targetDate.getTime() - Date.now();
    if (delay > 0) {
      this.timer = setTimeout(() => this.onTimerFire(), delay);
    }
  }
}

export const jobScheduler = new JobScheduler();
