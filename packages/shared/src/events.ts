export interface NotificationCreatedEvent {
  type: "notification.created";
  target: string;
  notificationId: string;
  userId: string;
  renderedTitle: string | null;
  renderedBody: string;
}

export interface JobStatsUpdatedEvent {
  type: "job.stats.updated";
  target: string;
}

export interface RateLimitUpdatedEvent {
  type: "rate_limit.updated";
  target: string;
}

export type ServerEvent =
  | NotificationCreatedEvent
  | JobStatsUpdatedEvent
  | RateLimitUpdatedEvent;
