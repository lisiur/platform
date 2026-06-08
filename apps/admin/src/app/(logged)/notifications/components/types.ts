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
