import type { JobHandlerRegistry } from "#lib/queues/job-handler-registry";
import { aiUsageReserveSweepHandler } from "./ai-usage-reserve-sweep.handler";
import { auditLogSweepHandler } from "./audit-log-sweep.handler";
import { jobInstanceSweepHandler } from "./job-instance-sweep.handler";
import { operationLogSweepHandler } from "./operation-log-sweep.handler";
import { sendNotificationHandler } from "./send-notification.handler";
import { sessionSweepHandler } from "./session-sweep.handler";
import { syncCurrencyRatesHandler } from "./sync-currency-rates.handler";
import { verificationSweepHandler } from "./verification-sweep.handler";

export function registerJobHandlers(registry: JobHandlerRegistry): void {
  registry.register("send-notification", sendNotificationHandler);
  registry.register("session-sweep", sessionSweepHandler);
  registry.register("ai-usage-reserve-sweep", aiUsageReserveSweepHandler);
  registry.register("job-instance-sweep", jobInstanceSweepHandler);
  registry.register("verification-sweep", verificationSweepHandler);
  registry.register("operation-log-sweep", operationLogSweepHandler);
  registry.register("audit-log-sweep", auditLogSweepHandler);
  registry.register("sync-currency-rates", syncCurrencyRatesHandler);
}
