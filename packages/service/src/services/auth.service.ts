import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
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
import { createNotificationsFromTemplate } from "#services/notification/notification.service";
import { eventBus } from "#states";

export type { AuthSession, AuthSessionUser, AuthType };

function assertNotBanned(user: {
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
}) {
  if (
    user.banned &&
    (!user.banExpires || user.banExpires.getTime() > Date.now())
  ) {
    throw new HTTPException(403, {
      message: user.banReason ?? "Account banned",
    });
  }
}

async function logAuthLogin(
  session: AuthSession,
  userName: string,
  traceId?: string,
) {
  await logAudit({
    traceId,
    userId: session.userId,
    userName,
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

async function getDefaultActiveOrganizationId(userId: string) {
  const memberships = await prisma.member.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });

  // Only auto-select when the user belongs to a single organization.
  // Users with multiple organizations must choose one themselves.
  if (memberships.length === 1) {
    return memberships[0].organizationId;
  }

  return null;
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
    await logAudit({
      traceId: params.traceId,
      userId: user?.id,
      userName: user?.name,
      event: "auth.login_failed",
      category: "authentication",
      outcome: "failure",
      severity: "warning",
      targetType: "user",
      targetId: user?.id,
      metadata: {
        email: params.email,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        reason: !user
          ? "unknown_user"
          : !credential?.password
            ? "no_credential"
            : "wrong_password",
      },
    });
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  assertNotBanned(user);

  const session = await createSession({
    userId: user.id,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    activeOrganizationId: await getDefaultActiveOrganizationId(user.id),
  });

  await logAuthLogin(session, user.name, params.traceId);

  // `accounts` holds credential password hashes and OAuth tokens; strip it so
  // secrets are never serialized into the sign-in response.
  const { accounts: _accounts, ...publicUser } = user;
  return { user: publicUser, session };
}

async function enqueueWelcomeNotifications(
  userId: string,
  name: string,
  appId: string,
) {
  const siteName = "My Application";

  try {
    await createNotificationsFromTemplate({
      templateKey: "welcome",
      recipientUserIds: [userId],
      appId,
      source: "auth.signup",
      variables: { userName: name },
    });

    await createNotificationsFromTemplate({
      templateKey: "welcome-email",
      recipientUserIds: [userId],
      appId,
      source: "auth.signup",
      variables: { userName: name, siteName },
    });
  } catch (err) {
    console.error(
      `[signup] Failed to send welcome notifications for ${userId}:`,
      err,
    );
  }
}

export async function getRegistrationEnabled(): Promise<boolean> {
  const config = await systemConfigRepository.findByGroupAndKey(
    "auth",
    "registration.enabled",
  );
  return config?.value === "true";
}

export async function signUpWithEmail(params: {
  name: string;
  email: string;
  password: string;
  appId: string;
  ipAddress?: string | null;
  traceId?: string;
  userAgent?: string | null;
}) {
  if (!(await getRegistrationEnabled())) {
    throw new HTTPException(403, { message: "Registration is disabled" });
  }

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

  await enqueueWelcomeNotifications(user.id, user.name, params.appId);

  const session = await createSession({
    userId: user.id,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  await logAuthLogin(session, user.name, params.traceId);

  return { user, session };
}

export async function signOut(
  token: string | null,
  appCode: string,
  traceId?: string,
) {
  const session = await deleteSessionByToken(token);
  if (session) {
    if (token) {
      eventBus.close(`sse:${appCode}:${session.userId}:${token}`);
    }
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { name: true },
    });
    await logAudit({
      traceId,
      userId: session.userId,
      userName: user?.name,
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
  userId: string;
  callerSessionId: string;
  currentPassword: string;
  newPassword: string;
  traceId?: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
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

  const callerSession = await prisma.session.findUniqueOrThrow({
    where: { id: params.callerSessionId },
  });

  const now = new Date();
  await prisma.$transaction([
    prisma.account.update({
      where: { id: credential.id },
      data: { password: await hashPassword(params.newPassword) },
    }),
    prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  const session = await createSession({
    userId: user.id,
    ipAddress: callerSession.ipAddress,
    userAgent: callerSession.userAgent,
    activeOrganizationId: callerSession.activeOrganizationId,
  });

  await logAudit({
    traceId: params.traceId,
    userId: user.id,
    sessionId: session.id,
    event: "auth.password_change",
    category: "authentication",
    targetType: "user",
    targetId: user.id,
  });

  const updatedUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
  });

  return { user: updatedUser, session };
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

  type AccountWithUser = Prisma.AccountGetPayload<{ include: { user: true } }>;

  const lookupAccount = () =>
    prisma.account.findUnique({
      where: {
        providerId_accountId: {
          providerId: "wechat",
          accountId: wechatResult.openid,
        },
      },
      include: { user: true },
    });

  async function loginWithAccount(account: AccountWithUser) {
    assertNotBanned(account.user);

    await prisma.account.update({
      where: { id: account.id },
      data: { accessToken: wechatResult.session_key },
    });

    const session = await createSession({
      userId: account.userId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      activeOrganizationId: await getDefaultActiveOrganizationId(
        account.userId,
      ),
    });

    await logAuthLogin(session, account.user.name, params.traceId);

    return { user: account.user, session };
  }

  const existingAccount = await lookupAccount();
  if (existingAccount) {
    return await loginWithAccount(existingAccount);
  }

  if (!(await getRegistrationEnabled())) {
    throw new HTTPException(403, { message: "Registration is disabled" });
  }

  try {
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

    await logAuthLogin(session, user.name, params.traceId);

    return { user, session };
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "P2002"
    ) {
      const account = await lookupAccount();
      if (account) {
        return await loginWithAccount(account);
      }
    }
    throw err;
  }
}
