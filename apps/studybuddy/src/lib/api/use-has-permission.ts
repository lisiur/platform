"use client";

import { createUseHasPermission } from "@repo/frontend";
import { useSessionStore } from "@/stores/session-store";

export const useHasPermission = createUseHasPermission(useSessionStore);
