"use client";

import { createMenuStore, getFirstMenuUrl } from "@repo/frontend";
import { appClient } from "@/lib/api";

export const useMenuStore = createMenuStore(appClient);
export { getFirstMenuUrl };
