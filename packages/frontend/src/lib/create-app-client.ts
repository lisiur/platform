import { DEV_SSR_TOKEN } from "@repo/shared";
import type { Hono } from "hono";
import { hc } from "hono/client";

// biome-ignore lint/suspicious/noExplicitAny: mirrors hono's own hc<AppType> constraint
export function createAppClient<AppType extends Hono<any, any, any>>(
  appCode: string,
  manifest: { apps: { name: string; port: number }[] },
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
  const fallbackApiOrigin = `http://localhost:${manifest.apps.find((a) => a.name === "gateway")?.port ?? 3000}`;
  const API_ORIGIN = isServer
    ? (serverEnv?.API_ORIGIN ?? fallbackApiOrigin)
    : window.location.origin;

  const headers: Record<string, string> = { "X-App-Code": appCode };
  const ssrToken =
    serverEnv?.SSR_API_TOKEN ??
    (serverEnv?.NODE_ENV !== "production" ? DEV_SSR_TOKEN : undefined);
  if (isServer && ssrToken) {
    headers["X-Internal-Token"] = ssrToken;
  }

  const appClient = hc<AppType>(API_ORIGIN, { headers });

  return { appClient, APP_CODE: appCode, API_ORIGIN };
}
