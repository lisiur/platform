import { z } from "zod";
import {
  buildConfigIndex,
  type ConfigRegistryEntry,
} from "#lib/config-registry";

// Shared value-schema fragments. Each yields a string (stored verbatim).
//
// `""` is a first-class value for boolean/select keys: it means "unset → fall
// back to env" (mergeEnvFallback treats an empty DB value as unset). Accepting
// it lets the API restore the seeded default state and lets the admin UI save a
// cleared field instead of 400ing.
//
// `intValue` deliberately stays strict: "" would coerce to 0 at read time,
// which for rate-limit.max is a deny-all footgun. Reset a number via delete.
const boolValue = z.enum(["true", "false", ""]);
const intValue = z.string().regex(/^\d+$/, "Must be a non-negative integer");
const jsonValue = z.string().refine((s) => {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}, "Must be valid JSON");

/**
 * The single source of truth for system (global) config keys. Consumed by both
 * `src/seed.ts` (writes `defaultValue`) and the system-config API service
 * (validates `valueSchema`, enforces registry-authoritative metadata).
 *
 * To add a config key: append one entry here. Seed will write it, the API will
 * accept it, and the listing endpoint will render it — no other edit needed.
 */
export const SYSTEM_CONFIG_REGISTRY: ConfigRegistryEntry[] = [
  // --- auth ---
  {
    group: "auth",
    key: "registration.enabled",
    defaultValue: "true",
    type: "boolean",
    label: "settings.fields.enableRegistration",
    description: "settings.fieldsDesc.enableRegistration",
    isSecret: false,
    sortOrder: 0,
    valueSchema: boolValue,
  },
  {
    group: "auth",
    key: "session.maxAge",
    // Value is in SECONDS (604800 = 7 days). Honors AUTH_SESSION_MAX_AGE env.
    defaultValue: "604800",
    type: "number",
    label: "settings.fields.sessionMaxAge",
    description: "settings.fieldsDesc.sessionMaxAge",
    isSecret: false,
    sortOrder: 1,
    valueSchema: intValue,
  },

  // --- wechat ---
  {
    group: "wechat",
    key: "appid",
    defaultValue: "",
    type: "string",
    label: "settings.fields.wechatAppid",
    description: "settings.fieldsDesc.wechatAppid",
    isSecret: false,
    sortOrder: 0,
    valueSchema: z.string(),
  },
  {
    group: "wechat",
    key: "secret",
    defaultValue: "",
    type: "string",
    label: "settings.fields.wechatSecret",
    description: "settings.fieldsDesc.wechatSecret",
    isSecret: true,
    mask: "start{4}.{*}",
    sortOrder: 1,
    valueSchema: z.string(),
  },

  // --- apple ---
  {
    group: "apple",
    key: "clientId",
    defaultValue: "",
    type: "string",
    label: "settings.fields.appleClientId",
    description: "settings.fieldsDesc.appleClientId",
    isSecret: false,
    sortOrder: 0,
    valueSchema: z.string(),
  },
  {
    group: "apple",
    key: "appAudiences",
    defaultValue: "",
    type: "string",
    label: "settings.fields.appleAppAudiences",
    description: "settings.fieldsDesc.appleAppAudiences",
    isSecret: false,
    sortOrder: 1,
    valueSchema: z.string(),
  },

  // --- webauthn ---
  {
    group: "webauthn",
    key: "enabled",
    defaultValue: "",
    type: "boolean",
    label: "settings.fields.webauthnEnabled",
    description: "settings.fieldsDesc.webauthnEnabled",
    isSecret: false,
    sortOrder: 0,
    valueSchema: boolValue,
  },
  {
    group: "webauthn",
    key: "rp.name",
    defaultValue: "",
    type: "string",
    label: "settings.fields.webauthnRpName",
    description: "settings.fieldsDesc.webauthnRpName",
    isSecret: false,
    sortOrder: 1,
    valueSchema: z.string(),
  },
  {
    group: "webauthn",
    key: "rp.id",
    defaultValue: "",
    type: "string",
    label: "settings.fields.webauthnRpId",
    description: "settings.fieldsDesc.webauthnRpId",
    isSecret: false,
    sortOrder: 2,
    valueSchema: z.string(),
  },
  {
    group: "webauthn",
    key: "origin",
    defaultValue: "",
    type: "string",
    label: "settings.fields.webauthnOrigin",
    description: "settings.fieldsDesc.webauthnOrigin",
    isSecret: false,
    sortOrder: 3,
    valueSchema: z.string(),
  },

  // --- upload ---
  {
    group: "upload",
    key: "hotlink",
    defaultValue: JSON.stringify({
      enabled: false,
      allowedDomains: [],
      allowEmptyReferer: true,
    }),
    type: "json",
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["enabled", "allowedDomains", "allowEmptyReferer"],
      properties: {
        enabled: {
          type: "boolean",
          title: "settings.fields.uploadHotlinkEnabled",
          default: false,
        },
        allowedDomains: {
          type: "array",
          title: "settings.fields.uploadHotlinkAllowedDomains",
          description: "settings.fieldsDesc.uploadHotlinkAllowedDomains",
          items: { type: "string" },
          default: [],
        },
        allowEmptyReferer: {
          type: "boolean",
          title: "settings.fields.uploadHotlinkAllowEmptyReferer",
          description: "settings.fieldsDesc.uploadHotlinkAllowEmptyReferer",
          default: true,
        },
      },
    },
    label: "settings.fields.uploadHotlink",
    description: "settings.fieldsDesc.uploadHotlink",
    isSecret: false,
    sortOrder: 0,
    valueSchema: jsonValue,
  },

  // --- rate-limit ---
  {
    group: "rate-limit",
    key: "enabled",
    defaultValue: "true",
    type: "boolean",
    label: "settings.fields.rateLimitEnabled",
    description: "settings.fieldsDesc.rateLimitEnabled",
    isSecret: false,
    sortOrder: 0,
    valueSchema: boolValue,
  },
  {
    group: "rate-limit",
    key: "global.max",
    defaultValue: "300",
    type: "number",
    label: "settings.fields.rateLimitGlobalMax",
    description: "settings.fieldsDesc.rateLimitGlobalMax",
    isSecret: false,
    sortOrder: 1,
    valueSchema: intValue,
  },
  {
    group: "rate-limit",
    key: "global.windowMs",
    defaultValue: "60000",
    type: "number",
    label: "settings.fields.rateLimitGlobalWindowMs",
    description: "settings.fieldsDesc.rateLimitGlobalWindowMs",
    isSecret: false,
    sortOrder: 2,
    valueSchema: intValue,
  },
  {
    group: "rate-limit",
    key: "auth.max",
    defaultValue: "10",
    type: "number",
    label: "settings.fields.rateLimitAuthMax",
    description: "settings.fieldsDesc.rateLimitAuthMax",
    isSecret: false,
    sortOrder: 3,
    valueSchema: intValue,
  },
  {
    group: "rate-limit",
    key: "auth.windowMs",
    defaultValue: "60000",
    type: "number",
    label: "settings.fields.rateLimitAuthWindowMs",
    description: "settings.fieldsDesc.rateLimitAuthWindowMs",
    isSecret: false,
    sortOrder: 4,
    valueSchema: intValue,
  },
  {
    group: "rate-limit",
    key: "trustProxy",
    defaultValue: "uniqueLocal,loopback,linkLocal",
    type: "string",
    label: "settings.fields.rateLimitTrustProxy",
    description: "settings.fieldsDesc.rateLimitTrustProxy",
    isSecret: false,
    sortOrder: 5,
    valueSchema: z.string(),
  },

  // --- currency ---
  {
    group: "currency",
    key: "creditsCurrency",
    defaultValue: "CNY",
    type: "select",
    label: "settings.fields.currencyCreditsCurrency",
    description: "settings.fieldsDesc.currencyCreditsCurrency",
    schema: {
      options: [
        { value: "CNY", label: "settings.currencyOptions.CNY" },
        { value: "USD", label: "settings.currencyOptions.USD" },
      ],
    },
    isSecret: false,
    sortOrder: 0,
    valueSchema: z.enum(["CNY", "USD"]),
  },
  {
    group: "currency",
    key: "creditsPerUnit",
    defaultValue: "100",
    type: "number",
    label: "settings.fields.currencyCreditsPerUnit",
    description: "settings.fieldsDesc.currencyCreditsPerUnit",
    isSecret: false,
    sortOrder: 1,
    valueSchema: intValue,
  },
  {
    group: "currency",
    key: "lastSync",
    defaultValue: "",
    type: "string",
    label: "settings.fields.currencyLastSync",
    description: "settings.fieldsDesc.currencyLastSync",
    isSecret: false,
    sortOrder: 2,
    valueSchema: z.string(),
  },

  // --- self-update ---
  {
    group: "self-update",
    key: "enabled",
    defaultValue: "",
    type: "boolean",
    label: "settings.fields.selfUpdateEnabled",
    description: "settings.fieldsDesc.selfUpdateEnabled",
    isSecret: false,
    sortOrder: 0,
    valueSchema: boolValue,
  },
  {
    group: "self-update",
    key: "source",
    defaultValue: "",
    type: "select",
    label: "settings.fields.selfUpdateSource",
    description: "settings.fieldsDesc.selfUpdateSource",
    schema: {
      options: [
        { value: "github", label: "settings.selfUpdateSourceOptions.github" },
        {
          value: "manifest",
          label: "settings.selfUpdateSourceOptions.manifest",
        },
      ],
    },
    isSecret: false,
    sortOrder: 1,
    valueSchema: z.enum(["github", "manifest", ""]),
  },
  {
    group: "self-update",
    key: "githubRepo",
    defaultValue: "",
    type: "string",
    label: "settings.fields.selfUpdateGithubRepo",
    description: "settings.fieldsDesc.selfUpdateGithubRepo",
    isSecret: false,
    schema: { dependsOn: { field: "source", value: "github" } },
    sortOrder: 2,
    valueSchema: z.string(),
  },
  {
    group: "self-update",
    key: "githubToken",
    defaultValue: "",
    type: "string",
    label: "settings.fields.selfUpdateGithubToken",
    description: "settings.fieldsDesc.selfUpdateGithubToken",
    isSecret: true,
    mask: "start{4}.{*}",
    schema: { dependsOn: { field: "source", value: "github" } },
    sortOrder: 3,
    valueSchema: z.string(),
  },
  {
    group: "self-update",
    key: "githubProxy",
    defaultValue: "",
    type: "string",
    label: "settings.fields.selfUpdateGithubProxy",
    description: "settings.fieldsDesc.selfUpdateGithubProxy",
    isSecret: false,
    schema: { dependsOn: { field: "source", value: "github" } },
    sortOrder: 4,
    valueSchema: z.string(),
  },
  {
    group: "self-update",
    key: "manifestUrl",
    defaultValue: "",
    type: "string",
    label: "settings.fields.selfUpdateManifestUrl",
    description: "settings.fieldsDesc.selfUpdateManifestUrl",
    isSecret: false,
    schema: { dependsOn: { field: "source", value: "manifest" } },
    sortOrder: 5,
    valueSchema: z.string(),
  },
  {
    group: "self-update",
    key: "releaseUrlTemplate",
    defaultValue: "",
    type: "string",
    label: "settings.fields.selfUpdateReleaseUrlTemplate",
    description: "settings.fieldsDesc.selfUpdateReleaseUrlTemplate",
    isSecret: false,
    schema: { dependsOn: { field: "source", value: "manifest" } },
    sortOrder: 6,
    valueSchema: z.string(),
  },
  {
    group: "self-update",
    key: "authToken",
    defaultValue: "",
    type: "string",
    label: "settings.fields.selfUpdateAuthToken",
    description: "settings.fieldsDesc.selfUpdateAuthToken",
    isSecret: true,
    mask: "start{4}.{*}",
    schema: { dependsOn: { field: "source", value: "manifest" } },
    sortOrder: 7,
    valueSchema: z.string(),
  },
];

export const SYSTEM_CONFIG_INDEX = buildConfigIndex(SYSTEM_CONFIG_REGISTRY);
