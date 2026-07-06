import { jobHandlerRegistry } from "#lib/queues/job-handler-registry";
import { sendEmailHandler } from "./send-email.handler";
import { sendNotificationHandler } from "./send-notification.handler";

export function registerJobHandlers(): void {
  jobHandlerRegistry.register("send-email", sendEmailHandler);
  jobHandlerRegistry.register("send-notification", sendNotificationHandler);
}
