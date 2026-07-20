import { isBuiltinUser } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { logAudit } from "#lib/logger";
import { hashPassword } from "#lib/password";
import { assertUserIsNotBuiltin } from "#lib/protected-user";
import { ADMIN_SCOPE } from "#lib/scope";
import { createUser as createAuthUser } from "#services/auth.service";

const userWithRolesInclude = {
  roleAssignments: {
    where: { scope: ADMIN_SCOPE },
    include: {
      role: {
        select: {
          id: true,
          appId: true,
          name: true,
          code: true,
        },
      },
    },
  },
} as const;

export async function listUsers(limit: number, offset: number) {
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
      include: userWithRolesInclude,
    }),
    prisma.user.count(),
  ]);

  return { users, total };
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  roleIds: string[];
}) {
  const { name, email, password, roleIds } = data;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new HTTPException(400, { message: "User already exists" });
  }

  const result = await createAuthUser({
    name,
    email,
    password,
  }).catch(async () => {
    const conflictingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (conflictingUser) {
      return null;
    }

    throw new Error("Failed to create user");
  });

  if (!result) {
    throw new HTTPException(400, { message: "User already exists" });
  }

  if (!result.user) {
    throw new HTTPException(500, { message: "Failed to create user" });
  }

  const userId = result.user.id;

  try {
    await prisma.$transaction(async (tx) => {
      for (const roleId of roleIds) {
        await tx.roleAssignment.upsert({
          where: {
            userId_roleId_scope: {
              userId,
              roleId,
              scope: ADMIN_SCOPE,
            },
          },
          update: {},
          create: {
            userId,
            roleId,
            scope: ADMIN_SCOPE,
          },
        });
      }
    });
  } catch {
    await prisma.user.delete({ where: { id: userId } }).catch(() => null);
    throw new HTTPException(500, { message: "Failed to assign user roles" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: userWithRolesInclude,
  });

  if (!user) {
    throw new HTTPException(500, { message: "Failed to fetch created user" });
  }

  return user;
}

export async function updateUser(
  id: string,
  data: {
    name?: string;
    email?: string;
    roleIds?: string[];
  },
) {
  const { name, email, roleIds } = data;

  const existingUser = await prisma.user.findUnique({
    where: { id },
  });

  if (!existingUser) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const builtin = isBuiltinUser(existingUser.flags);

  if (builtin && roleIds !== undefined) {
    throw new HTTPException(403, {
      message: "Cannot change roles of builtin users",
    });
  }

  if (email && email !== existingUser.email) {
    const emailTaken = await prisma.user.findUnique({
      where: { email },
    });

    if (emailTaken) {
      throw new HTTPException(400, { message: "Email already taken" });
    }
  }

  const updateData: Record<string, unknown> = {};
  if (name) updateData.name = name;
  if (email) updateData.email = email;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(updateData).length > 0) {
      await tx.user.update({
        where: { id },
        data: updateData,
      });
    }

    if (!builtin && roleIds !== undefined) {
      await tx.roleAssignment.deleteMany({
        where: {
          userId: id,
          scope: ADMIN_SCOPE,
        },
      });

      for (const roleId of roleIds) {
        await tx.roleAssignment.upsert({
          where: {
            userId_roleId_scope: {
              userId: id,
              roleId,
              scope: ADMIN_SCOPE,
            },
          },
          update: {},
          create: {
            userId: id,
            roleId,
            scope: ADMIN_SCOPE,
          },
        });
      }
    }
  });

  const user = await prisma.user.findUnique({
    where: { id },
    include: userWithRolesInclude,
  });

  if (!user) {
    throw new HTTPException(500, {
      message: "Failed to fetch updated user",
    });
  }

  return user;
}

export async function resetPassword(
  id: string,
  newPassword: string,
  params: { traceId?: string; actorId?: string; actorSessionId?: string },
) {
  const existingUser = await prisma.user.findUnique({
    where: { id },
  });

  if (!existingUser) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const hashedPassword = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    const existingAccount = await tx.account.findFirst({
      where: { userId: id, providerId: "credential" },
    });

    if (existingAccount) {
      await tx.account.update({
        where: { id: existingAccount.id },
        data: { password: hashedPassword },
      });
    } else {
      await tx.account.create({
        data: {
          accountId: id,
          providerId: "credential",
          userId: id,
          password: hashedPassword,
        },
      });
    }

    await tx.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await logAudit({
    traceId: params.traceId,
    userId: params.actorId,
    authType: "session",
    authTokenId: params.actorSessionId,
    event: "user.password_reset",
    category: "authentication",
  });
}

export async function updateUserProfile(
  userId: string,
  data: { name?: string; image?: string | null },
) {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
  });

  return { user };
}

export async function deleteUser(id: string) {
  await assertUserIsNotBuiltin(id);

  const user = await prisma.user.findUnique({ where: { id } });

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  await prisma.user.delete({ where: { id } });

  return { success: true };
}
