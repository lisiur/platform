import type { Hono } from "hono";
import { hc } from "hono/client";

// biome-ignore lint/suspicious/noExplicitAny: mirrors hono's own hc<AppType> constraint
export function createAppClient<AppType extends Hono<any, any, any>>(
  appCode: string,
): {
  appClient: ReturnType<typeof hc<AppType>>;
  APP_CODE: string;
  API_ORIGIN: string;
} {
  const isServer = typeof window === "undefined";
  const serverEnv = isServer
    ? (
        globalThis as typeof globalThis & {
          process?: { env?: Record<string, string | undefined> };
        }
      ).process?.env
    : undefined;
  const API_ORIGIN = isServer ? serverEnv?.API_ORIGIN : window.location.origin;

  if (!API_ORIGIN) {
    throw new Error(
      "API_ORIGIN is required for server-side API calls. " +
        "Set it in apps/<app>/.env (dev) or the deployment env (prod).",
    );
  }

  const headers: Record<string, string> = { "X-App-Code": appCode };
  if (isServer && serverEnv?.SSR_API_TOKEN) {
    headers["X-Internal-Token"] = serverEnv.SSR_API_TOKEN;
  }

  const appClient = hc<AppType>(API_ORIGIN, { headers });

  return { appClient, APP_CODE: appCode, API_ORIGIN };
}
