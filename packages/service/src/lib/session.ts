import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { prisma } from "#lib/db";
import { logAudit } from "#lib/logger";

export const SESSION_COOKIE_NAME = "next101.session_token";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_REFRESH_AFTER_MS = 60 * 60 * 24 * 1000;

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
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

  await logAudit({
    userId: session.userId,
    sessionId: session.id,
    event: "auth.login",
    category: "authentication",
    targetType: "session",
    targetId: session.id,
    metadata: {
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    },
  });

  return session;
}

export async function getSessionByToken(token: string | null) {
  if (!token) return null;

  const result = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!result) return null;

  if (result.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: result.id } }).catch(() => null);
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

export async function deleteSessionByToken(token: string | null) {
  if (!token) return null;

  const session = await prisma.session.findUnique({ where: { token } });
  if (!session) return null;

  await prisma.session.delete({ where: { id: session.id } });
  await logAudit({
    userId: session.userId,
    sessionId: session.id,
    event: "auth.logout",
    category: "authentication",
    targetType: "session",
    targetId: session.id,
  });

  return session;
}
