import type { Job, JobHandler } from "./job.types";

type JobHandlerMap = Record<string, JobHandler>;

class HandlerRegistry {
  private handlers: JobHandlerMap = {};

  register(type: string, handler: JobHandler): void {
    this.handlers[type] = handler;
  }

  registerMany(handlers: JobHandlerMap): void {
    Object.assign(this.handlers, handlers);
  }

  get(type: string): JobHandler | undefined {
    return this.handlers[type];
  }

  has(type: string): boolean {
    return type in this.handlers;
  }

  async execute(job: Job): Promise<unknown> {
    const handler = this.handlers[job.type];
    if (!handler) {
      throw new Error(`No handler registered for job type: ${job.type}`);
    }
    return handler(job);
  }
}

export const jobHandlerRegistry = new HandlerRegistry();
