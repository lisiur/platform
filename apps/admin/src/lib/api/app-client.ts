import type { app } from "@repo/service";
import { hc } from "hono/client";

type AppType = typeof app;

const APP_CODE = "admin";
const LOCAL_SHELL_ORIGIN = "http://localhost:3000";
const getBrowserApiOrigin = () => {
  if (
    window.location.hostname === "localhost" &&
    window.location.port === "3001"
  ) {
    return LOCAL_SHELL_ORIGIN;
  }
  return window.location.origin;
};

const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN ||
  (typeof window !== "undefined" ? getBrowserApiOrigin() : LOCAL_SHELL_ORIGIN);

// Admin-panel zone uses the shell app's API at /api/
export const appClient = hc<AppType>(API_ORIGIN, {
  headers: { "X-App-Code": APP_CODE },
});
