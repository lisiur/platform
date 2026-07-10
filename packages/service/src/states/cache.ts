import { Cache } from "#lib/cache";

const CACHE_MAX_SIZE = parseInt(process.env.CACHE_MAX_SIZE ?? "1000", 10);
export const globalCache = Cache.create(CACHE_MAX_SIZE);
export const notificationChannelCache = globalCache.namespace(
  "notification:channel",
);
export const notificationTemplateCache = globalCache.namespace(
  "notification:template",
);
