import type { JobRepository } from "#repositories/job.repository";
import type { Job } from "./job.types";
import type { JobExecutorContext } from "./job-executor-context";
import type { JobQueue } from "./job-queue";

const MAX_TIMER_DURATION_MS = 24 * 60 * 60 * 1000;

interface JobSchedulerDeps {
  repository: JobRepository;
  queue: JobQueue;
  context: JobExecutorContext;
}

export class JobScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: JobSchedulerDeps) {
    this.deps.context.on("job:created", (job) => this.onJobCreated(job));
    this.deps.context.on("job:rescheduled", (job) =>
      this.rescheduleIfNeeded(job),
    );
  }

  async start(): Promise<void> {
    await this.loadExpiredJobs();
  }

  async loadExpiredJobs(): Promise<void> {
    let nextTimer: Date | null = null;

    while (true) {
      const jobs = await this.deps.repository.findPendingJobs({ limit: 1000 });

      if (jobs.length === 0) break;

      for (const job of jobs) {
        if (job.scheduledAt <= new Date()) {
          this.deps.queue.add(job);
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

    const nextJob = await this.deps.repository.findNextScheduledJob();

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
      this.deps.queue.add(job);
    }
    await this.rescheduleIfNeeded(job);
  }

  private async rescheduleIfNeeded(_job: Job): Promise<void> {
    const nextJob = await this.deps.repository.findNextScheduledJob();
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
