"use client";

import { createSessionStore } from "@repo/frontend";
import { appClient } from "@/lib/api";

export const useSessionStore = createSessionStore(appClient);
