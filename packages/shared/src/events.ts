export interface NotificationCreatedEvent {
  type: "notification.created";
  notificationId: string;
  userId: string;
  appId: string | null;
  renderedTitle: string | null;
  renderedBody: string;
}

export interface JobStatsUpdatedEvent {
  type: "job.stats.updated";
  appId: "admin";
}

export type ServerEvent = NotificationCreatedEvent | JobStatsUpdatedEvent;
