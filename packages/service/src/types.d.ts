import type { AuthType } from "#lib/session";
import type { Application } from "#routes/application/schema";

declare module "hono" {
  interface ContextVariableMap {
    appId: string;
    currentApp: Application;
    session: AuthType | null;
    traceId: string;
  }
}
