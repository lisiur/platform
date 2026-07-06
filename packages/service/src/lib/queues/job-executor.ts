import type { Job } from "#generated/prisma/client";
import type { JobRepository } from "#repositories/job.repository";
import { JobArchiver } from "./job-archive";
import { JobExecutorContext } from "./job-executor-context";
import type { JobHandlerRegistry } from "./job-handler-registry";
import { JobQueue } from "./job-queue";
import { JobScheduler } from "./job-scheduler";
import { JobWorker } from "./job-worker";

interface JobExecutorDeps {
  repository: JobRepository;
  registry: JobHandlerRegistry;
  concurrency?: number;
}

export class JobExecutor {
  private readonly context = new JobExecutorContext();
  private readonly queue: JobQueue;
  private readonly archiver: JobArchiver;
  private readonly worker: JobWorker;
  private readonly scheduler: JobScheduler;

  constructor(deps: JobExecutorDeps) {
    this.queue = new JobQueue({ concurrency: deps.concurrency });
    this.archiver = new JobArchiver(deps.repository);
    this.worker = new JobWorker({
      repository: deps.repository,
      context: this.context,
      archiver: this.archiver,
      registry: deps.registry,
    });
    this.queue.setProcessor((job) => this.worker.processJob(job));
    this.scheduler = new JobScheduler({
      repository: deps.repository,
      queue: this.queue,
      context: this.context,
    });
  }

  start(): void {
    this.scheduler.start().catch(console.error);
  }

  enqueue(job: Job): void {
    this.context.emit("job:created", job);
  }

  getStats() {
    return {
      queueSize: this.queue.size,
      pending: this.queue.pending,
      concurrency: this.queue.concurrency,
    };
  }
}
