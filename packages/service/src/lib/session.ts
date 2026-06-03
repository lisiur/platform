import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { prisma } from "#lib/db";

export const SESSION_COOKIE_NAME = "session_token";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_REFRESH_AFTER_MS = 60 * 60 * 24 * 1000;

export type AuthSessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
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
  user: AuthSessionUser;
  session: AuthSession;
};

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function deleteSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
}

export function getSessionTokenFromContext(c: Context) {
  return getCookie(c, SESSION_COOKIE_NAME) ?? null;
}

export async function createSession(params: {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      token,
      userId: params.userId,
      expiresAt,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });

  return session;
}

export function getSessionTokenFromHeaders(headers: Headers) {
  const cookie = headers.get("cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return null;
}

export async function getSessionByToken(token: string | null) {
  if (!token) return null;

  const result = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!result) return null;

  if (result.revokedAt) return null;

  if (result.expiresAt.getTime() <= Date.now()) {
    await prisma.session
      .update({ where: { id: result.id }, data: { revokedAt: new Date() } })
      .catch(() => null);
    return null;
  }

  if (Date.now() - result.updatedAt.getTime() >= SESSION_REFRESH_AFTER_MS) {
    return prisma.session.update({
      where: { id: result.id },
      data: {
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
      },
      include: { user: true },
    });
  }

  return result;
}

export async function getSessionFromHeaders(
  headers: Headers,
): Promise<AuthType | null> {
  const token = getSessionTokenFromHeaders(headers);
  const result = await getSessionByToken(token);
  if (!result) return null;
  const { user, ...session } = result;
  return { user, session };
}

export async function deleteSessionByToken(token: string | null) {
  if (!token) return null;

  const session = await prisma.session.findUnique({ where: { token } });
  if (!session) return null;

  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  return session;
}
