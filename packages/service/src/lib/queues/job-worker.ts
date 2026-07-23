import type { JobInstance } from "#generated/prisma/client";
import { JobStatus } from "#generated/prisma/client";
import type { JobInstanceRepository } from "#repositories/job-instance.repository";
import type { JobExecutorContext } from "./job-executor-context";
import type { JobHandlerRegistry } from "./job-handler-registry";

const RETRY_BACKOFF_BASE_MS = 5_000;
const RETRY_BACKOFF_MAX_MS = 5 * 60 * 1000;

interface JobWorkerDeps {
  repository: JobInstanceRepository;
  context: JobExecutorContext;
  registry: JobHandlerRegistry;
}

export class JobWorker {
  constructor(private readonly deps: JobWorkerDeps) {}

  async processJob(job: JobInstance): Promise<void> {
    await this.deps.repository.updateStatus(job.id, JobStatus.PROCESSING, {
      startedAt: new Date(),
      attempts: job.attempts + 1,
    });
    this.deps.context.emit("job:processing", job);

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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (job.attempts + 1 >= job.maxAttempts) {
        await this.deps.repository.updateStatus(job.id, JobStatus.FAILED, {
          completedAt: new Date(),
          error: errorMessage,
        });
        this.deps.context.emit("job:failed", job);
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
  }
}
