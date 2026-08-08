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

export interface AgentSessionTitleUpdatedEvent {
  type: "agent.session.title.updated";
  target: string;
  sessionId: string;
  name: string;
}

export type UpdatePhase =
  | "idle"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";
export type ApplyUpdateMode = "update" | "redeploy";

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

export interface UpdateStatus {
  phase: UpdatePhase;
  step: string;
  message: string;
  targetTag: string | null;
  mode: ApplyUpdateMode | null;
  progress: DownloadProgress | null;
  startedAt: string | null;
  updatedAt: string | null;
}

export interface SelfUpdateStatusUpdatedEvent {
  type: "self_update.status.updated";
  target: string;
  phase: UpdatePhase;
  step: string;
  message: string;
  targetTag: string | null;
  mode: ApplyUpdateMode | null;
  progress: {
    downloadedBytes: number;
    totalBytes: number | null;
    percent: number | null;
  } | null;
}

export type ServerEvent =
  | NotificationCreatedEvent
  | JobStatsUpdatedEvent
  | RateLimitUpdatedEvent
  | AgentSessionTitleUpdatedEvent
  | SelfUpdateStatusUpdatedEvent;
