import type { AuthType } from "#lib/session";
import type { Application } from "#routes/application/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string, options: { eager: true }): Record<string, unknown>;
  }
}

declare module "hono" {
  interface ContextVariableMap {
    appId: string;
    currentApp: Application;
    session: AuthType | null;
    traceId: string;
  }
}
