import { JobExecutor } from "#lib/queues/job-executor";
import { JobHandlerRegistry } from "#lib/queues/job-handler-registry";
import { jobRepository } from "#repositories/job.repository";
import { eventBus } from "../event-bus";
import { registerJobHandlers } from "./handlers";

const registry = new JobHandlerRegistry();
registerJobHandlers(registry);

export const jobExecutor = new JobExecutor({
  repository: jobRepository,
  registry,
});

jobExecutor.subscribe(() => {
  eventBus.broadcast({ type: "job.stats.updated", appId: "admin" });
});
