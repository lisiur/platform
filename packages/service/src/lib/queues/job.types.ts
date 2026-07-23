import type { JobInstance } from "#generated/prisma/client";

export type { JobInstance };

export type JobHandler<_TPayload = unknown, TResult = unknown> = (
  job: JobInstance,
) => Promise<TResult>;
