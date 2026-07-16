import { createAppClient } from "@repo/frontend";
import type { app } from "@repo/service";

export const { appClient, APP_CODE, API_ORIGIN } =
  createAppClient<typeof app>("organization");
