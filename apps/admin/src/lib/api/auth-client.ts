"use client";

import { ac, admin, manager, user } from "@repo/shared";
import { createAuthClient } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";
import { toast } from "sonner";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    adminClient({
      ac,
      roles: {
        admin,
        manager,
        user,
      },
    }),
  ],
  fetchOptions: {
    onError: async (ctx) => {
      const error = await ctx.response?.json().catch(() => null);
      const message = error?.message ?? ctx.error?.message ?? "Request failed";
      toast.error(message);
    },
  },
});
