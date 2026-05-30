import { prisma } from "#lib/db";
import { hashPassword } from "#lib/password";
import { getSessionByToken, getSessionTokenFromHeaders } from "#lib/session";

export type AuthSessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
  flags: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type AuthSession = {
  id: string;
  expiresAt: Date;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthType = {
  user: AuthSessionUser | null;
  session: AuthSession | null;
};

export const auth = {
  api: {
    async getSession({
      headers,
    }: {
      headers: Headers;
    }): Promise<AuthType | null> {
      const token = getSessionTokenFromHeaders(headers);
      const result = await getSessionByToken(token);
      if (!result) return null;

      const { user, ...session } = result;
      return { user, session };
    },

    async createUser({
      body,
    }: {
      body: {
        name: string;
        email: string;
        password: string;
        role?: string | null;
      };
    }) {
      const user = await prisma.user.create({
        data: {
          name: body.name,
          email: body.email.toLowerCase(),
          emailVerified: false,
          role: body.role ?? "user",
          flags: [],
          accounts: {
            create: {
              accountId: body.email.toLowerCase(),
              providerId: "credential",
              password: await hashPassword(body.password),
            },
          },
        },
      });

      return { user };
    },
  },
};
