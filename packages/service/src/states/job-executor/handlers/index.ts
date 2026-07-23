import type { JobHandlerRegistry } from "#lib/queues/job-handler-registry";
import { jobInstanceCleanupHandler } from "./job-instance-cleanup.handler";
import { sendNotificationHandler } from "./send-notification.handler";
import { sessionSweepHandler } from "./session-sweep.handler";

export function registerJobHandlers(registry: JobHandlerRegistry): void {
  registry.register("send-notification", sendNotificationHandler);
  registry.register("session-sweep", sessionSweepHandler);
  registry.register("job-instance-cleanup", jobInstanceCleanupHandler);
}
