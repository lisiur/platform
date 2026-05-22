import { ac, admin as adminRole, manager, user } from "@repo/shared";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, openAPI, organization } from "better-auth/plugins";
import type { AccessControl } from "better-auth/plugins/access";
import { prisma } from "./db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 1,
  },
  socialProviders: {
    wechat: {
      enabled: !!process.env.WECHAT_CLIENT_ID,
      clientId: process.env.WECHAT_CLIENT_ID ?? "",
      clientSecret: process.env.WECHAT_CLIENT_SECRET ?? "",
      lang: "cn",
    },
  },
  plugins: [
    openAPI(),
    admin({
      ac: ac as AccessControl,
      roles: {
        admin: adminRole,
        manager,
        user,
      },
    }),
    organization(),
  ],
});

export type AuthType = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};
