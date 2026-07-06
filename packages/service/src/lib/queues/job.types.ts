import type { Job } from "#generated/prisma/client";

export type { Job };

export type JobHandler<_TPayload = unknown, TResult = unknown> = (
  job: Job,
) => Promise<TResult>;
