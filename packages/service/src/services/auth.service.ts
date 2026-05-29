import { HTTPException } from "hono/http-exception";
import { auth } from "#lib/auth";
import { prisma } from "#lib/db";
import { hashPassword, verifyPassword } from "#lib/password";
import { createSession, deleteSessionByToken } from "#lib/session";

export async function signInWithEmail(params: {
  email: string;
  password: string;
  ipAddress?: string | null;
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

  return { user, session };
}

export async function signUpWithEmail(params: {
  name: string;
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const existingUser = await prisma.user.findUnique({
    where: { email: params.email.toLowerCase() },
  });
  if (existingUser) {
    throw new HTTPException(400, { message: "User already exists" });
  }

  const { user } = await auth.api.createUser({
    body: {
      name: params.name,
      email: params.email,
      password: params.password,
      role: "user",
    },
  });

  const session = await createSession({
    userId: user.id,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return { user, session };
}

export async function signOut(token: string | null) {
  await deleteSessionByToken(token);
}

export async function getSession(headers: Headers) {
  return auth.api.getSession({ headers });
}

export async function changePassword(params: {
  headers: Headers;
  currentPassword: string;
  newPassword: string;
}) {
  const session = await auth.api.getSession({ headers: params.headers });
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
  const session = await auth.api.getSession({ headers: params.headers });
  if (!session?.user) throw new HTTPException(401, { message: "Unauthorized" });

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: params.data,
  });

  return { user };
}
