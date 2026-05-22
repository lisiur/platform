import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, openAPI, organization } from "better-auth/plugins";
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
  plugins: [openAPI(), admin(), organization()],
});

export type AuthType = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};
