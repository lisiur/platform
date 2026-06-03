import type { Application } from "#routes/application/schema";
import type { AuthType } from "#lib/session";

declare module "hono" {
  interface ContextVariableMap {
    appId: string;
    currentApp: Application;
    session: AuthType | null;
    traceId: string;
  }
}
