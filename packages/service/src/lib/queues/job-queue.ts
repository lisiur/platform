import PQueue from "p-queue";
import type { Job } from "./job.types";

type JobProcessor = (job: Job) => Promise<void>;

interface JobQueueOptions {
  concurrency?: number;
  autoStart?: boolean;
}

export class JobQueue {
  private queue: PQueue;
  private processor: JobProcessor | null = null;

  constructor(opts?: JobQueueOptions) {
    const concurrency =
      opts?.concurrency ?? parseInt(process.env.JOB_CONCURRENCY ?? "5", 10);
    this.queue = new PQueue({
      concurrency,
      autoStart: opts?.autoStart ?? true,
    });
  }

  setProcessor(fn: JobProcessor): void {
    this.processor = fn;
  }

  add(job: Job): void {
    this.queue.add(async () => {
      if (this.processor) await this.processor(job);
    });
  }

  async addAndWait(job: Job): Promise<void> {
    await this.queue.add(async () => {
      if (this.processor) await this.processor(job);
    });
  }

  get size(): number {
    return this.queue.size;
  }

  get pending(): number {
    return this.queue.pending;
  }

  get concurrency(): number {
    return this.queue.concurrency;
  }

  onIdle(): Promise<unknown> {
    return this.queue.onIdle();
  }

  clear(): void {
    this.queue.clear();
  }
}
