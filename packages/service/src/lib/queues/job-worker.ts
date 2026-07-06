import type { Job } from "#generated/prisma/client";
import { JobStatus } from "#generated/prisma/client";
import type { JobRepository } from "#repositories/job.repository";
import type { JobArchiver } from "./job-archive";
import type { JobExecutorContext } from "./job-executor-context";
import type { JobHandlerRegistry } from "./job-handler-registry";

const RETRY_BACKOFF_BASE_MS = 5_000;
const RETRY_BACKOFF_MAX_MS = 5 * 60 * 1000;

interface JobWorkerDeps {
  repository: JobRepository;
  context: JobExecutorContext;
  archiver: JobArchiver;
  registry: JobHandlerRegistry;
}

export class JobWorker {
  constructor(private readonly deps: JobWorkerDeps) {}

  async processJob(job: Job): Promise<void> {
    await this.deps.repository.updateStatus(job.id, JobStatus.PROCESSING, {
      startedAt: new Date(),
      attempts: job.attempts + 1,
    });

    let terminal = false;

    try {
      const handler = this.deps.registry.get(job.type);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.type}`);
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Job timed out")), job.timeoutMs);
      });

      const result = await Promise.race([handler(job), timeoutPromise]);

      await this.deps.repository.updateStatus(job.id, JobStatus.COMPLETED, {
        completedAt: new Date(),
        result,
      });

      this.deps.context.emit("job:completed", job);
      terminal = true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (job.attempts + 1 >= job.maxAttempts) {
        await this.deps.repository.updateStatus(job.id, JobStatus.FAILED, {
          completedAt: new Date(),
          error: errorMessage,
        });
        this.deps.context.emit("job:failed", job);
        terminal = true;
      } else {
        const attemptsMade = job.attempts + 1;
        const backoff = Math.min(
          RETRY_BACKOFF_BASE_MS * 2 ** (attemptsMade - 1),
          RETRY_BACKOFF_MAX_MS,
        );
        const retriedJob = await this.deps.repository.updateStatus(
          job.id,
          JobStatus.PENDING,
          {
            error: errorMessage,
            scheduledAt: new Date(Date.now() + backoff),
          },
        );
        this.deps.context.emit("job:rescheduled", retriedJob);
      }
    }

    if (terminal) {
      const fresh = await this.deps.repository.findById(job.id);
      if (fresh) {
        await this.deps.archiver.archive(fresh);
      }
    }
  }
}
