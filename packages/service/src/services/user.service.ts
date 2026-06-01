import { isBuiltinUser } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { hashPassword } from "#lib/password";
import { assertUserIsNotBuiltin } from "#lib/protected-user";
import { createUser as createAuthUser } from "#services/auth.service";

const ADMIN_APP_ID = "admin";

const userWithRolesInclude = {
  userRoles: {
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

type UserRoleSyncTx = {
  userRole: Pick<typeof prisma.userRole, "deleteMany" | "findFirst" | "upsert">;
  user: Pick<typeof prisma.user, "update">;
};

async function syncUserRolesAndAuthRole(
  tx: UserRoleSyncTx,
  params: {
    userId: string;
    roleIds: string[];
    replace?: boolean;
    currentRole?: string | null;
  },
) {
  if (params.replace) {
    await tx.userRole.deleteMany({
      where: { userId: params.userId },
    });
  }

  for (const roleId of params.roleIds) {
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: params.userId, roleId } },
      update: {},
      create: { userId: params.userId, roleId },
    });
  }

  const hasAdminRole = await tx.userRole.findFirst({
    where: {
      userId: params.userId,
      role: {
        appId: ADMIN_APP_ID,
        authRole: "admin",
      },
    },
  });

  const derivedRole = hasAdminRole ? "admin" : "user";

  if (derivedRole !== (params.currentRole ?? "user")) {
    await tx.user.update({
      where: { id: params.userId },
      data: { role: derivedRole },
    });
  }
}

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
    role: "user",
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
    await prisma.$transaction(async (tx: UserRoleSyncTx) => {
      await syncUserRolesAndAuthRole(tx, { userId, roleIds });
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
    password?: string;
    roleIds?: string[];
  },
) {
  const { name, email, password, roleIds } = data;

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
  if (password) {
    const hashedPassword = await hashPassword(password);
    const existingAccount = await prisma.account.findFirst({
      where: { userId: id, providerId: "credential" },
    });
    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: { password: hashedPassword },
      });
    } else {
      await prisma.account.create({
        data: {
          accountId: id,
          providerId: "credential",
          userId: id,
          password: hashedPassword,
        },
      });
    }
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  if (!builtin && roleIds !== undefined) {
    await prisma.$transaction(async (tx: UserRoleSyncTx) => {
      await syncUserRolesAndAuthRole(tx, {
        userId: id,
        roleIds,
        replace: true,
        currentRole: existingUser.role,
      });
    });
  }

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

export async function deleteUser(id: string) {
  await assertUserIsNotBuiltin(id);

  const user = await prisma.user.findUnique({ where: { id } });

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  await prisma.user.delete({ where: { id } });

  return { success: true };
}
