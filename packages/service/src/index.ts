/// <reference path="./types.d.ts" />

export { app } from "./app";
export type { AuthType } from "./modules/identity/public";
export { prisma } from "./shared/lib/db";
export {
  globalCache,
  notificationChannelCache,
  notificationTemplateCache,
} from "./shared/states/cache";
