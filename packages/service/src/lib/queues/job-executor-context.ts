import type { Job } from "#generated/prisma/client";

type JobEvent = {
  "job:created": Job;
  "job:processing": Job;
  "job:completed": Job;
  "job:failed": Job;
  "job:rescheduled": Job;
};

type Listener<T> = (data: T) => void;

export class JobExecutorContext {
  private listeners: Partial<{
    [K in keyof JobEvent]: Listener<JobEvent[K]>[];
  }> = {};

  on<K extends keyof JobEvent>(
    event: K,
    listener: Listener<JobEvent[K]>,
  ): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]?.push(listener as Listener<JobEvent[keyof JobEvent]>);
  }

  off<K extends keyof JobEvent>(
    event: K,
    listener: Listener<JobEvent[K]>,
  ): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event]?.filter(
      (l) => l !== (listener as Listener<JobEvent[keyof JobEvent]>),
    );
  }

  emit<K extends keyof JobEvent>(event: K, data: JobEvent[K]): void {
    if (!this.listeners[event]) return;
    this.listeners[event]?.forEach((listener) => {
      void listener(data);
    });
  }
}
