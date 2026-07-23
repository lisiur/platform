import { HTTPException } from "hono/http-exception";
import type { Job, JobInstance, JobPriority } from "#generated/prisma/client";
import { nextRunFromNow, validateCron } from "#lib/cron";
import { jobRepository } from "#repositories/job.repository";
import { jobInstanceRepository } from "#repositories/job-instance.repository";
import { jobExecutor } from "#states";

export interface CreateJobInput {
  name: string;
  type: string;
  description?: string;
  payload?: unknown;
  cronExpression?: string;
  enabled?: boolean;
  priority?: JobPriority;
  maxAttempts?: number;
  timeoutMs?: number;
}

export interface UpdateJobInput {
  name?: string;
  type?: string;
  description?: string;
  payload?: unknown;
  cronExpression?: string | null;
  enabled?: boolean;
  priority?: JobPriority;
  maxAttempts?: number;
  timeoutMs?: number;
}

export interface JobFilter {
  enabled?: boolean;
  type?: string;
  limit?: number;
  offset?: number;
}

function assertCronValid(expression: string | undefined | null): void {
  if (expression !== undefined && expression !== null && expression !== "") {
    if (!validateCron(expression)) {
      throw new HTTPException(400, {
        message: `Invalid cron expression: ${expression}`,
      });
    }
  }
}

export class JobTemplateService {
  async createTemplate(input: CreateJobInput): Promise<Job> {
    assertCronValid(input.cronExpression);

    const existing = await jobRepository.findByName(input.name);
    if (existing) {
      throw new HTTPException(409, {
        message: `Job template with name '${input.name}' already exists`,
      });
    }

    const cron =
      input.cronExpression && input.cronExpression.length > 0
        ? input.cronExpression
        : null;
    const nextRunAt =
      input.enabled !== false && cron ? nextRunFromNow(cron) : null;

    const template = await jobRepository.create({
      name: input.name,
      type: input.type,
      description: input.description,
      payload: input.payload,
      cronExpression: cron,
      enabled: input.enabled,
      priority: input.priority,
      maxAttempts: input.maxAttempts,
      timeoutMs: input.timeoutMs,
      nextRunAt,
    });

    await jobExecutor.rearmTemplateScheduler();

    return template;
  }

  async getTemplate(id: string): Promise<Job> {
    const template = await jobRepository.findById(id);
    if (!template) {
      throw new HTTPException(404, { message: "Job template not found" });
    }
    return template;
  }

  async listTemplates(
    filter: JobFilter,
  ): Promise<{ jobs: Job[]; total: number }> {
    return jobRepository.findMany(filter);
  }

  async updateTemplate(id: string, input: UpdateJobInput): Promise<Job> {
    const existing = await this.getTemplate(id);
    assertCronValid(input.cronExpression);

    const cronChanged = input.cronExpression !== undefined;
    const enabledChanged = input.enabled !== undefined;
    const cron =
      input.cronExpression === undefined
        ? existing.cronExpression
        : input.cronExpression && input.cronExpression.length > 0
          ? input.cronExpression
          : null;

    let nextRunAt = existing.nextRunAt;
    const enabled = input.enabled ?? existing.enabled;

    if (cronChanged || enabledChanged) {
      nextRunAt = enabled && cron ? nextRunFromNow(cron) : null;
    }

    const updated = await jobRepository.update(id, {
      name: input.name,
      type: input.type,
      description: input.description,
      payload: input.payload,
      cronExpression: cron,
      enabled: input.enabled,
      priority: input.priority,
      maxAttempts: input.maxAttempts,
      timeoutMs: input.timeoutMs,
      nextRunAt,
    });

    await jobExecutor.rearmTemplateScheduler();

    return updated;
  }

  async deleteTemplate(id: string): Promise<void> {
    await this.getTemplate(id);
    await jobRepository.delete(id);
    await jobExecutor.rearmTemplateScheduler();
  }

  async triggerTemplate(id: string): Promise<JobInstance> {
    const template = await this.getTemplate(id);
    const now = new Date();

    const instance = await jobInstanceRepository.create({
      jobId: template.id,
      type: template.type,
      description: template.description,
      payload: template.payload ?? {},
      priority: template.priority,
      maxAttempts: template.maxAttempts,
      timeoutMs: template.timeoutMs,
      scheduledAt: now,
    });

    jobExecutor.enqueue(instance);

    return instance;
  }
}

export const jobTemplateService = new JobTemplateService();
