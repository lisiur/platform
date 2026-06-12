export interface NotificationProvider {
  key: string;
  name: string;
  description: string;
  configSchema: unknown;
  secretFields: string[];
}

export interface NotificationChannel {
  id: string;
  key: string;
  name: string;
  providerKey: string;
  enabled: boolean;
  config?: unknown;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface NotificationTemplate {
  id: string;
  key: string;
  channelId: string;
  channel: NotificationChannel;
  name: string;
  description?: string | null;
  enabled: boolean;
  subjectTemplate?: string | null;
  titleTemplate?: string | null;
  bodyTemplate: string;
  variablesSchema?: unknown;
  sampleVariables?: unknown;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface NotificationRecordRelationUser {
  id: string;
  name: string;
  email: string;
}

export interface NotificationRecordRelationTemplate {
  id: string;
  key: string;
  name: string;
}

export interface NotificationRecordRelationChannel {
  id: string;
  key: string;
  name: string;
  providerKey: string;
}

export interface NotificationRecord {
  id: string;
  correlationId: string;
  templateId: string;
  channelId: string;
  recipientUserId: string;
  creatorId?: string | null;
  source?: string | null;
  variables?: unknown;
  renderedSubject?: string | null;
  renderedTitle?: string | null;
  renderedBody: string;
  status: string;
  attempts: number;
  nextAttemptAt?: string | null;
  sentAt?: string | null;
  failedAt?: string | null;
  readAt?: string | null;
  archivedAt?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
  recipient: NotificationRecordRelationUser;
  template: NotificationRecordRelationTemplate;
  channel: NotificationRecordRelationChannel;
}

export type NotificationRecordListItem = Pick<
  NotificationRecord,
  | "id"
  | "renderedSubject"
  | "renderedTitle"
  | "status"
  | "readAt"
  | "archivedAt"
  | "createdAt"
  | "recipient"
  | "template"
  | "channel"
>;
