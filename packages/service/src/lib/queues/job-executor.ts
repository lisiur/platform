import type { JobInstance } from "#generated/prisma/client";
import type { JobRepository } from "#repositories/job.repository";
import type { JobInstanceRepository } from "#repositories/job-instance.repository";
import { JobExecutorContext } from "./job-executor-context";
import type { JobHandlerRegistry } from "./job-handler-registry";
import { JobQueue } from "./job-queue";
import { JobScheduler } from "./job-scheduler";
import { JobTemplateScheduler } from "./job-template-scheduler";
import { JobWorker } from "./job-worker";

interface JobExecutorDeps {
  jobRepository: JobRepository;
  instanceRepository: JobInstanceRepository;
  registry: JobHandlerRegistry;
  concurrency?: number;
}

export type JobExecutorEventName =
  | "job:created"
  | "job:processing"
  | "job:completed"
  | "job:failed"
  | "job:rescheduled";

export interface JobExecutorEvent {
  type: JobExecutorEventName;
  job: JobInstance;
}

export class JobExecutor {
  private readonly context = new JobExecutorContext();
  private readonly queue: JobQueue;
  private readonly worker: JobWorker;
  private readonly scheduler: JobScheduler;
  private readonly templateScheduler: JobTemplateScheduler;

  constructor(deps: JobExecutorDeps) {
    this.queue = new JobQueue({ concurrency: deps.concurrency });
    this.worker = new JobWorker({
      repository: deps.instanceRepository,
      context: this.context,
      registry: deps.registry,
    });
    this.queue.setProcessor((job) => this.worker.processJob(job));
    this.scheduler = new JobScheduler({
      repository: deps.instanceRepository,
      queue: this.queue,
      context: this.context,
    });
    this.templateScheduler = new JobTemplateScheduler({
      jobRepository: deps.jobRepository,
      instanceRepository: deps.instanceRepository,
      context: this.context,
    });
  }

  start(): void {
    this.scheduler.start().catch(console.error);
    this.templateScheduler.start().catch(console.error);
  }

  enqueue(job: JobInstance): void {
    this.context.emit("job:created", job);
  }

  async rearmTemplateScheduler(): Promise<void> {
    await this.templateScheduler.onTemplateChanged();
  }

  subscribe(listener: (event: JobExecutorEvent) => void): () => void {
    const events: JobExecutorEventName[] = [
      "job:created",
      "job:processing",
      "job:completed",
      "job:failed",
      "job:rescheduled",
    ];
    const pairs = events.map((type) => {
      const fn = (job: JobInstance) => listener({ type, job });
      this.context.on(type, fn);
      return { type, fn };
    });
    return () => {
      for (const { type, fn } of pairs) this.context.off(type, fn);
    };
  }

  getStats() {
    return {
      queueSize: this.queue.size,
      pending: this.queue.pending,
      concurrency: this.queue.concurrency,
    };
  }
}
