import PQueue from "p-queue";
import type { Job } from "./job.types";

const CONCURRENCY = parseInt(process.env.JOB_CONCURRENCY ?? "5", 10);

type JobProcessor = (job: Job) => Promise<void>;

class JobQueue {
  private queue: PQueue;
  private processor: JobProcessor | null = null;

  constructor() {
    this.queue = new PQueue({
      concurrency: CONCURRENCY,
      autoStart: true,
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

  onIdle(): Promise<unknown> {
    return this.queue.onIdle();
  }

  clear(): void {
    this.queue.clear();
  }
}

export const jobQueue = new JobQueue();
