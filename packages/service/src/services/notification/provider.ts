import { HTTPException } from "hono/http-exception";
import { z } from "zod";

export const NOTIFICATION_PROVIDER_KEYS = [
  "in-app",
  "smtp-email",
  "sms",
] as const;

export const REDACTED_NOTIFICATION_SECRET = "********";

export type NotificationProviderKey =
  (typeof NOTIFICATION_PROVIDER_KEYS)[number];

export interface NotificationProviderDefinition {
  key: NotificationProviderKey;
  name: string;
  description: string;
  configSchema: unknown;
  secretFields: string[];
  validateConfig: (config: unknown) => unknown;
}

const inAppConfigSchema = z.object({}).strict().optional().nullable();

const smtpEmailConfigSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65_535),
  secure: z.boolean().default(false),
  username: z.string().optional(),
  password: z.string().optional(),
  from: z.string().min(1),
});

const smsConfigSchema = z.object({
  providerName: z.string().min(1),
  apiKey: z.string().min(1),
  from: z.string().min(1).optional(),
});

const providerDefinitions: Record<
  NotificationProviderKey,
  NotificationProviderDefinition
> = {
  "in-app": {
    key: "in-app",
    name: "In-App",
    description: "Stores notifications for in-app display.",
    configSchema: null,
    secretFields: [],
    validateConfig: (config) => inAppConfigSchema.parse(config) ?? null,
  },
  "smtp-email": {
    key: "smtp-email",
    name: "SMTP Email",
    description: "Creates email notification outbox records for SMTP delivery.",
    configSchema: {
      type: "object",
      additionalProperties: false,
      required: ["host", "port", "from"],
      properties: {
        host: { type: "string" },
        port: { type: "number", minimum: 1, maximum: 65_535 },
        secure: { type: "boolean", default: false },
        username: { type: "string" },
        password: { type: "string", format: "password" },
        from: { type: "string" },
      },
    },
    secretFields: ["password"],
    validateConfig: (config) => smtpEmailConfigSchema.parse(config),
  },
  sms: {
    key: "sms",
    name: "SMS",
    description: "Creates SMS notification outbox records for a future sender.",
    configSchema: {
      type: "object",
      additionalProperties: false,
      required: ["providerName", "apiKey"],
      properties: {
        providerName: { type: "string" },
        apiKey: { type: "string", format: "password" },
        from: { type: "string" },
      },
    },
    secretFields: ["apiKey"],
    validateConfig: (config) => smsConfigSchema.parse(config),
  },
};

export function isNotificationProviderKey(
  value: string,
): value is NotificationProviderKey {
  return NOTIFICATION_PROVIDER_KEYS.includes(value as NotificationProviderKey);
}

export function getNotificationProvider(providerKey: string) {
  if (!isNotificationProviderKey(providerKey)) {
    throw new HTTPException(400, { message: "Unknown notification provider" });
  }
  return providerDefinitions[providerKey];
}

export function listNotificationProviders() {
  return NOTIFICATION_PROVIDER_KEYS.map((key) => {
    const provider = providerDefinitions[key];
    return {
      key: provider.key,
      name: provider.name,
      description: provider.description,
      configSchema: provider.configSchema,
      secretFields: provider.secretFields,
    };
  });
}

export function validateNotificationProviderConfig(
  providerKey: string,
  config: unknown,
) {
  const provider = getNotificationProvider(providerKey);

  try {
    return provider.validateConfig(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HTTPException(400, {
        message: `Invalid ${providerKey} provider config`,
      });
    }
    throw error;
  }
}

export function redactNotificationProviderConfig(
  providerKey: string,
  config: unknown,
) {
  if (config === null || config === undefined || typeof config !== "object") {
    return config ?? null;
  }

  const provider = getNotificationProvider(providerKey);
  const redacted: Record<string, unknown> = {
    ...(config as Record<string, unknown>),
  };

  for (const field of provider.secretFields) {
    if (
      field in redacted &&
      redacted[field] !== undefined &&
      redacted[field] !== null
    ) {
      redacted[field] = REDACTED_NOTIFICATION_SECRET;
    }
  }

  return redacted;
}
