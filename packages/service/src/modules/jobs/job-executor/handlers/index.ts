import type { JobHandlerRegistry } from "#lib/queues/job-handler-registry";
import { auditLogSweepHandler } from "./audit-log-sweep.handler";
import { jobInstanceSweepHandler } from "./job-instance-sweep.handler";
import { operationLogSweepHandler } from "./operation-log-sweep.handler";
import { sendNotificationHandler } from "./send-notification.handler";
import { sessionSweepHandler } from "./session-sweep.handler";
import { verificationSweepHandler } from "./verification-sweep.handler";

export function registerJobHandlers(registry: JobHandlerRegistry): void {
  registry.register("send-notification", sendNotificationHandler);
  registry.register("session-sweep", sessionSweepHandler);
  registry.register("job-instance-sweep", jobInstanceSweepHandler);
  registry.register("verification-sweep", verificationSweepHandler);
  registry.register("operation-log-sweep", operationLogSweepHandler);
  registry.register("audit-log-sweep", auditLogSweepHandler);
}
