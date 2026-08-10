import { createAppClient } from "@repo/frontend";
import type { app } from "@repo/service";
import manifest from "@root/manifest.json";

export const { appClient, APP_CODE, API_ORIGIN } = createAppClient<typeof app>(
  "studybuddy",
  manifest,
);
