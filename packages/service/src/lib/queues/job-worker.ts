import type { Job } from "#generated/prisma/client";
import { JobStatus } from "#generated/prisma/client";
import { jobRepository } from "#repositories/job.repository";
import { jobEvents } from "./job.events";
import { jobArchiver } from "./job-archive";
import { jobHandlerRegistry } from "./job-handler-registry";
import { jobQueue } from "./job-queue";

export class JobWorker {
  async start(): Promise<void> {
    jobQueue.onIdle().then(() => {
      // All jobs processed
    });
  }

  async processJob(job: Job): Promise<void> {
    await jobRepository.updateStatus(job.id, JobStatus.PROCESSING, {
      startedAt: new Date(),
      attempts: job.attempts + 1,
    });

    try {
      const handler = jobHandlerRegistry.get(job.type);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.type}`);
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Job timed out")), job.timeoutMs);
      });

      const result = await Promise.race([handler(job), timeoutPromise]);

      await jobRepository.updateStatus(job.id, JobStatus.COMPLETED, {
        completedAt: new Date(),
        result,
      });

      jobEvents.emit("job:completed", job);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (job.attempts + 1 >= job.maxAttempts) {
        await jobRepository.updateStatus(job.id, JobStatus.FAILED, {
          completedAt: new Date(),
          error: errorMessage,
        });
        jobEvents.emit("job:failed", job);
      } else {
        await jobRepository.updateStatus(job.id, JobStatus.PENDING, {
          error: errorMessage,
        });
      }
    }

    await jobArchiver.archive(job);
  }
}

export const jobWorker = new JobWorker();
