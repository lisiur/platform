import { HTTPException } from "hono/http-exception";
import type { JobInstance, JobPriority } from "#generated/prisma/client";
import { JobStatus } from "#generated/prisma/client";
import { jobInstanceRepository } from "#repositories/job-instance.repository";
import { jobExecutor } from "#states";

export interface CreateJobInstanceInput {
  type: string;
  description?: string;
  payload: unknown;
  priority?: JobPriority;
  scheduledAt?: Date;
  maxAttempts?: number;
  timeoutMs?: number;
}

export interface JobInstanceFilter {
  status?: JobStatus;
  type?: string;
  jobId?: string;
  limit?: number;
  offset?: number;
}

export class JobInstanceService {
  async createInstance(input: CreateJobInstanceInput): Promise<JobInstance> {
    const instance = await jobInstanceRepository.create({
      type: input.type,
      description: input.description,
      payload: input.payload,
      priority: input.priority,
      scheduledAt: input.scheduledAt,
      maxAttempts: input.maxAttempts,
      timeoutMs: input.timeoutMs,
    });

    jobExecutor.enqueue(instance);

    return instance;
  }

  async getInstance(id: string): Promise<JobInstance> {
    const instance = await jobInstanceRepository.findById(id);
    if (!instance) {
      throw new HTTPException(404, { message: "Job instance not found" });
    }
    return instance;
  }

  async listInstances(
    filter: JobInstanceFilter,
  ): Promise<{ jobs: JobInstance[]; total: number }> {
    return jobInstanceRepository.findByFilter(filter);
  }

  async cancelInstance(id: string): Promise<void> {
    const instance = await this.getInstance(id);

    if (instance.status !== JobStatus.PENDING) {
      throw new HTTPException(400, {
        message: "Only pending instances can be cancelled",
      });
    }

    await jobInstanceRepository.delete(id);
  }

  async getExecutorStats() {
    const live = jobExecutor.getStats();
    const [byStatus, nextInstance] = await Promise.all([
      jobInstanceRepository.countByStatus(),
      jobInstanceRepository.findNextScheduledJob(),
    ]);
    return {
      ...live,
      byStatus,
      nextScheduledAt: nextInstance?.scheduledAt ?? null,
    };
  }
}

export const jobInstanceService = new JobInstanceService();
