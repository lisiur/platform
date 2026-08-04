import { z } from "@hono/zod-openapi";

export const cacheValueTypeSchema = z.enum([
  "object",
  "array",
  "string",
  "number",
  "boolean",
  "null",
  "unknown",
]);

export const cacheNamespaceSchema = z
  .object({
    name: z.string().openapi({ example: "notification:channel" }),
    keyCount: z.number().int().openapi({ example: 3 }),
  })
  .openapi("CacheNamespace");

export const cacheStatsSchema = z
  .object({
    totalKeys: z.number().int().openapi({ example: 50 }),
    maxSize: z.number().int().openapi({ example: 1000 }),
    namespaces: z.array(cacheNamespaceSchema),
  })
  .openapi("CacheStats");

export const cacheKeyInfoSchema = z
  .object({
    fullKey: z.string().openapi({ example: "notification:channel:abc123" }),
    namespace: z.string().openapi({ example: "notification:channel" }),
    key: z.string().openapi({ example: "abc123" }),
    valueType: cacheValueTypeSchema.openapi({ example: "object" }),
  })
  .openapi("CacheKeyInfo");

export const cacheEntrySchema = cacheKeyInfoSchema
  .extend({
    value: z.unknown().openapi({ example: { id: "abc123", name: "Email" } }),
  })
  .openapi("CacheEntry");

export const listKeysQuerySchema = z.object({
  search: z.string().optional().openapi({ example: "notification" }),
});

export const entryQuerySchema = z.object({
  key: z.string().min(1).openapi({ example: "notification:channel:abc123" }),
});

export const updateEntryBodySchema = z.object({
  key: z.string().min(1).openapi({ example: "notification:channel:abc123" }),
  value: z.unknown().openapi({ example: { id: "abc123", enabled: true } }),
});

export const clearNamespaceBodySchema = z.object({
  namespace: z.string().min(1).openapi({ example: "notification:channel" }),
});

export const clearResultSchema = z
  .object({
    cleared: z.number().int().openapi({ example: 3 }),
  })
  .openapi("CacheClearResult");
