import type { Hono } from "hono";
import { hc } from "hono/client";

// biome-ignore lint/suspicious/noExplicitAny: mirrors hono's own hc<AppType> constraint
export function createAppClient<AppType extends Hono<any, any, any>>(
  appCode: string,
) {
  const API_ORIGIN =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.API_ORIGIN;

  if (!API_ORIGIN) {
    throw new Error(
      "API_ORIGIN is required for server-side API calls. " +
        "Set it in apps/<app>/.env (dev) or the deployment env (prod).",
    );
  }

  const appClient = hc<AppType>(API_ORIGIN, {
    headers: { "X-App-Code": appCode },
  });

  return { appClient, APP_CODE: appCode, API_ORIGIN };
}
