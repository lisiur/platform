import { HTTPException } from "hono/http-exception";
import type { Job, JobArchive, JobPriority } from "#generated/prisma/client";
import { JobStatus } from "#generated/prisma/client";
import { jobRepository } from "#repositories/job.repository";
import { jobExecutor } from "#states";

export interface CreateJobInput {
  type: string;
  payload: unknown;
  priority?: JobPriority;
  scheduledAt?: Date;
  maxAttempts?: number;
  timeoutMs?: number;
}

export interface JobFilter {
  status?: JobStatus;
  type?: string;
  limit?: number;
  offset?: number;
}

export class JobService {
  async createJob(input: CreateJobInput): Promise<Job> {
    const job = await jobRepository.create({
      type: input.type,
      payload: input.payload,
      priority: input.priority,
      scheduledAt: input.scheduledAt,
      maxAttempts: input.maxAttempts,
      timeoutMs: input.timeoutMs,
    });

    jobExecutor.enqueue(job);

    return job;
  }

  async getJob(id: string): Promise<Job> {
    const job = await jobRepository.findById(id);
    if (!job) {
      throw new HTTPException(404, { message: "Job not found" });
    }
    return job;
  }

  async listJobs(filter: {
    status?: JobStatus;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: Job[]; total: number }> {
    return jobRepository.findByFilter(filter);
  }

  async getArchivedJob(id: string): Promise<JobArchive> {
    const job = await jobRepository.findArchivedById(id);
    if (!job) {
      throw new HTTPException(404, { message: "Archived job not found" });
    }
    return job;
  }

  async listArchivedJobs(filter: {
    status?: JobStatus;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobArchives: JobArchive[]; total: number }> {
    return jobRepository.findArchivedByFilter(filter);
  }

  async retryJob(id: string): Promise<Job> {
    const job = await this.getJob(id);

    if (job.status !== JobStatus.FAILED) {
      throw new HTTPException(400, {
        message: "Only failed jobs can be retried",
      });
    }

    const retriedJob = await jobRepository.updateStatus(id, JobStatus.PENDING, {
      attempts: 0,
      error: undefined,
      completedAt: undefined,
    });

    jobExecutor.enqueue(retriedJob);

    return retriedJob;
  }

  async cancelJob(id: string): Promise<void> {
    const job = await this.getJob(id);

    if (job.status !== JobStatus.PENDING) {
      throw new HTTPException(400, {
        message: "Only pending jobs can be cancelled",
      });
    }

    await jobRepository.delete(id);
  }

  async getExecutorStats() {
    const live = jobExecutor.getStats();
    const byStatus = await jobRepository.countByStatus();
    return { ...live, byStatus };
  }
}

export const jobService = new JobService();
