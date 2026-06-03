import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { logAudit } from "#lib/logger";
import { hashPassword, verifyPassword } from "#lib/password";
import type { AuthSession, AuthSessionUser, AuthType } from "#lib/session";
import {
  createSession,
  deleteSessionByToken,
  getSessionFromHeaders,
} from "#lib/session";
import { code2Session } from "#lib/wechat";
import { systemConfigRepository } from "#repositories/system-config.repository";

export type { AuthSession, AuthSessionUser, AuthType };

async function logAuthLogin(session: AuthSession, traceId?: string) {
  await logAudit({
    traceId,
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
}

export async function signInWithEmail(params: {
  email: string;
  password: string;
  ipAddress?: string | null;
  traceId?: string;
  userAgent?: string | null;
}) {
  const user = await prisma.user.findUnique({
    where: { email: params.email.toLowerCase() },
    include: { accounts: true },
  });
  const credential = user?.accounts.find(
    (account) => account.providerId === "credential",
  );

  if (
    !user ||
    !credential?.password ||
    !(await verifyPassword(credential.password, params.password))
  ) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  const session = await createSession({
    userId: user.id,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  await logAuthLogin(session, params.traceId);

  return { user, session };
}

export async function signUpWithEmail(params: {
  name: string;
  email: string;
  password: string;
  ipAddress?: string | null;
  traceId?: string;
  userAgent?: string | null;
}) {
  const email = params.email.toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });
  if (existingUser) {
    throw new HTTPException(400, { message: "User already exists" });
  }

  const { user } = await createUser({
    name: params.name,
    email,
    password: params.password,
  });

  const session = await createSession({
    userId: user.id,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  await logAuthLogin(session, params.traceId);

  return { user, session };
}

export async function signOut(token: string | null, traceId?: string) {
  const session = await deleteSessionByToken(token);
  if (session) {
    await logAudit({
      traceId,
      userId: session.userId,
      sessionId: session.id,
      event: "auth.logout",
      category: "authentication",
      targetType: "session",
      targetId: session.id,
    });
  }
}

export async function getSession(headers: Headers): Promise<AuthType | null> {
  return getSessionFromHeaders(headers);
}

export async function createUser(body: {
  name: string;
  email: string;
  password: string;
}) {
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase(),
      emailVerified: false,
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
}

export async function changePassword(params: {
  headers: Headers;
  currentPassword: string;
  newPassword: string;
}) {
  const session = await getSession(params.headers);
  if (!session?.user) throw new HTTPException(401, { message: "Unauthorized" });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { accounts: true },
  });
  const credential = user?.accounts.find(
    (account) => account.providerId === "credential",
  );

  if (
    !user ||
    !credential?.password ||
    !(await verifyPassword(credential.password, params.currentPassword))
  ) {
    throw new HTTPException(400, {
      message: "Current password is incorrect",
    });
  }

  await prisma.account.update({
    where: { id: credential.id },
    data: { password: await hashPassword(params.newPassword) },
  });

  const updatedUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
  });

  return { user: updatedUser };
}

export async function updateUser(params: {
  headers: Headers;
  data: { name?: string; image?: string | null };
}) {
  const session = await getSession(params.headers);
  if (!session?.user) throw new HTTPException(401, { message: "Unauthorized" });

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: params.data,
  });

  return { user };
}

export async function signInWithWechat(params: {
  code: string;
  ipAddress?: string | null;
  traceId?: string;
  userAgent?: string | null;
}) {
  const appidConfig = await systemConfigRepository.findByGroupAndKey(
    "wechat",
    "appid",
  );
  const secretConfig = await systemConfigRepository.findByGroupAndKey(
    "wechat",
    "secret",
  );

  if (!appidConfig?.value || !secretConfig?.value) {
    throw new HTTPException(500, {
      message: "WeChat configuration is incomplete",
    });
  }

  const wechatResult = await code2Session({
    appid: appidConfig.value,
    secret: secretConfig.value,
    js_code: params.code,
  });

  const existingAccount = await prisma.account.findFirst({
    where: {
      providerId: "wechat",
      accountId: wechatResult.openid,
    },
    include: { user: true },
  });

  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: { accessToken: wechatResult.session_key },
    });

    const session = await createSession({
      userId: existingAccount.userId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    await logAuthLogin(session, params.traceId);

    return { user: existingAccount.user, session };
  }

  const user = await prisma.user.create({
    data: {
      name: `wx_${wechatResult.openid.slice(0, 8)}`,
      email: `${wechatResult.openid}@wechat.placeholder`,
      emailVerified: false,
      flags: [],
      accounts: {
        create: {
          accountId: wechatResult.openid,
          providerId: "wechat",
          accessToken: wechatResult.session_key,
        },
      },
    },
  });

  const session = await createSession({
    userId: user.id,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  await logAuthLogin(session, params.traceId);

  return { user, session };
}
