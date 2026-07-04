import { jobRepository } from "./job.repository";
import { jobEvents } from "./job.events";
import { HTTPException } from "hono/http-exception";
import { JobStatus, type CreateJobInput, type Job } from "./job.types";

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

    jobEvents.emit("job:created", job);

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

  async retryJob(id: string): Promise<Job> {
    const job = await this.getJob(id);

    if (job.status !== JobStatus.FAILED) {
      throw new HTTPException(400, { message: "Only failed jobs can be retried" });
    }

    const retriedJob = await jobRepository.updateStatus(id, JobStatus.PENDING, {
      attempts: 0,
      error: undefined,
      completedAt: undefined,
    });

    jobEvents.emit("job:created", retriedJob);

    return retriedJob;
  }

  async cancelJob(id: string): Promise<void> {
    const job = await this.getJob(id);

    if (job.status !== JobStatus.PENDING) {
      throw new HTTPException(400, { message: "Only pending jobs can be cancelled" });
    }

    await jobRepository.delete(id);
  }
}

export const jobService = new JobService();
