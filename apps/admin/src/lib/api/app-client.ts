import { hc } from "hono/client";
import type { AppType } from "@/app/api/[[...route]]/route";

const APP_CODE = "admin";

export const appClient = hc<AppType>("", {
  headers: { "X-App-Code": APP_CODE },
});
