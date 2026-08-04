import { JobExecutor } from "#lib/queues/job-executor";
import { JobHandlerRegistry } from "#lib/queues/job-handler-registry";
import { jobRepository } from "#modules/jobs/job.repository";
import { jobInstanceRepository } from "#modules/jobs/job-instance.repository";
import { eventBus } from "#states/event-bus";
import { registerJobHandlers } from "./handlers";

const registry = new JobHandlerRegistry();
registerJobHandlers(registry);

export const jobExecutor = new JobExecutor({
  jobRepository,
  instanceRepository: jobInstanceRepository,
  registry,
});

jobExecutor.subscribe(() => {
  eventBus.publish({ type: "job.stats.updated", target: "sse:admin:*:*" });
});
