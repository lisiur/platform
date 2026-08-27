import type { JobInstanceRepository } from "#modules/jobs/job-instance.repository";
import type { JobInstance } from "./job.types";
import type { JobExecutorContext } from "./job-executor-context";
import type { JobQueue } from "./job-queue";

const MAX_TIMER_DURATION_MS = 24 * 60 * 60 * 1000;
// Re-arm cadence after a failed DB round-trip: keeps the scheduler alive
// across transient outages (e.g. pool exhaustion) instead of dying silently.
const ERROR_RETRY_MS = 60_000;
// Minimum delay before re-querying when jobs are already due. Prevents a
// hot claim/findNext loop when a due row exists that can never be claimed.
const MIN_DUE_RELOAD_DELAY_MS = 1_000;

interface JobSchedulerDeps {
  repository: JobInstanceRepository;
  queue: JobQueue;
  context: JobExecutorContext;
}

export class JobScheduler {
  private timer: NodeJS.Timeout | null = null;
  private started = false;

  constructor(private readonly deps: JobSchedulerDeps) {
    this.deps.context.on("job:created", (job) => this.onJobCreated(job));
    this.deps.context.on("job:rescheduled", (job) =>
      this.rescheduleIfNeeded(job),
    );
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      // Reset PROCESSING rows orphaned by a previous process death. Safe only
      // under the single-process constraint (documented in ARCHITECTURE.md §8):
      // a second replica or rolling deploy would reset the first's in-flight
      // jobs, causing concurrent re-execution.
      await this.deps.repository.recoverStuckProcessing();
    } catch (err) {
      this.started = false;
      throw err;
    }
    try {
      await this.loadExpiredJobs();
    } catch (err) {
      // Recovery succeeded but initial load failed. Don't reset `started`:
      // onJobCreated still works, and the fallback timer keeps the scheduler
      // polling until the DB recovers.
      console.error("[job-scheduler] initial loadExpiredJobs failed:", err);
      this.armErrorRetryTimer();
    }
  }

  async loadExpiredJobs(): Promise<void> {
    const now = new Date();
    const BATCH = 1000;

    while (true) {
      const claimed = await this.deps.repository.claimDueJobs(now, BATCH);
      if (claimed.length === 0) break;

      for (const job of claimed) {
        this.deps.queue.add(job);
      }

      if (claimed.length < BATCH) break;
    }

    await this.scheduleNext();
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
      // Due now, but reload through a timer instead of recursing directly:
      // a row that stays due-but-unclaimable must not spin this loop hot.
      this.timer = setTimeout(
        () => this.onTimerFire(),
        MIN_DUE_RELOAD_DELAY_MS,
      );
    }
  }

  private onTimerFire(): void {
    this.loadExpiredJobs().catch((err) => {
      // A thrown load (e.g. pool exhaustion) must not kill the timer chain:
      // re-arm a slower poll so dispatch resumes once the DB recovers.
      console.error("[job-scheduler] scheduled load failed:", err);
      this.armErrorRetryTimer();
    });
  }

  /** Rearms the timer at the slower error-retry cadence. */
  private armErrorRetryTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.onTimerFire(), ERROR_RETRY_MS);
  }

  private onJobCreated(job: JobInstance): void {
    // Invoked synchronously from emit(); catch here so a DB failure never
    // surfaces as an unhandled rejection.
    this.handleJobCreated(job).catch((err) =>
      console.error("[job-scheduler] onJobCreated failed:", err),
    );
  }

  private async handleJobCreated(job: JobInstance): Promise<void> {
    const now = new Date();
    if (job.scheduledAt <= now) {
      const claimed = await this.deps.repository.claimJobById(job.id, now);
      if (claimed) {
        this.deps.queue.add(claimed);
      }
    }
    await this.rescheduleIfNeeded(job);
  }

  private async rescheduleIfNeeded(_job: JobInstance): Promise<void> {
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
}
