import type { Job } from "#generated/prisma/client";
import { nextRunFromNow } from "#lib/cron";
import type { JobRepository } from "#repositories/job.repository";
import type { JobInstanceRepository } from "#repositories/job-instance.repository";
import type { JobExecutorContext } from "./job-executor-context";

const MAX_TIMER_DURATION_MS = 24 * 60 * 60 * 1000;

interface JobTemplateSchedulerDeps {
  jobRepository: JobRepository;
  instanceRepository: JobInstanceRepository;
  context: JobExecutorContext;
}

export class JobTemplateScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: JobTemplateSchedulerDeps) {}

  async start(): Promise<void> {
    await this.dispatchDue();
  }

  async dispatchDue(now: Date = new Date()): Promise<void> {
    // Atomically claim due templates and advance their schedule. A failure
    // here must not prevent the timer from being rearmed, so it is caught.
    let due: Job[] = [];
    try {
      due = await this.deps.jobRepository.claimDueTemplates(now, (cron) =>
        nextRunFromNow(cron, now),
      );
    } catch (err) {
      console.error("[job-template-scheduler] claimDueTemplates failed:", err);
    }

    // Each template is dispatched independently: a single failure (e.g. a
    // transient DB error) must not halt dispatch for the remaining templates.
    for (const template of due) {
      if (!template.cronExpression) continue;
      try {
        const instance = await this.deps.instanceRepository.create({
          jobId: template.id,
          type: template.type,
          description: template.description,
          payload: template.payload ?? {},
          priority: template.priority,
          maxAttempts: template.maxAttempts,
          timeoutMs: template.timeoutMs,
        });
        this.deps.context.emit("job:created", instance);
      } catch (err) {
        console.error(
          `[job-template-scheduler] failed to dispatch template ${template.id}:`,
          err,
        );
      }
    }

    // Always rearm the timer, even if dispatching errored, so the scheduler
    // never silently stops until a restart.
    try {
      await this.armTimer();
    } catch (err) {
      console.error("[job-template-scheduler] armTimer failed:", err);
    }
  }

  async onTemplateChanged(): Promise<void> {
    await this.armTimer();
  }

  private async armTimer(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const nextTemplate = await this.deps.jobRepository.findNextDueTemplate();
    if (!nextTemplate?.nextRunAt) return;

    const delay = nextTemplate.nextRunAt.getTime() - Date.now();

    if (delay > MAX_TIMER_DURATION_MS) {
      this.timer = setTimeout(() => this.onTimerFire(), MAX_TIMER_DURATION_MS);
    } else if (delay > 0) {
      this.timer = setTimeout(() => this.onTimerFire(), delay);
    }
  }

  private onTimerFire(): void {
    // dispatchDue resolves without throwing (errors are logged internally), but
    // guard anyway to avoid an unhandled promise rejection killing the timer.
    this.dispatchDue().catch((err) =>
      console.error("[job-template-scheduler] dispatch failed:", err),
    );
  }
}
