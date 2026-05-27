import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { isBuiltinUser } from "@repo/shared";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "#lib/db";
import { requireAdmin } from "#middleware/require-admin";
import { userRoleRepository } from "#repositories/user-role.repository";
import {
  adminUserSchema,
  errorSchema,
  updateUserBodySchema,
  userIdParamSchema,
} from "./schema";

const ADMIN_APP_ID = "admin";

export const updateUser = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{id}",
    tags: ["AdminUser"],
    summary: "Update a user with custom roles",
    middleware: requireAdmin,
    request: {
      params: userIdParamSchema,
      body: {
        content: {
          "application/json": { schema: updateUserBodySchema },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: adminUserSchema } },
        description: "Updated user",
      },
      400: {
        content: { "application/json": { schema: errorSchema } },
        description: "Bad Request",
      },
      404: {
        content: { "application/json": { schema: errorSchema } },
        description: "User not found",
      },
      403: {
        content: { "application/json": { schema: errorSchema } },
        description: "Forbidden - cannot change roles of builtin users",
      },
      500: {
        content: { "application/json": { schema: errorSchema } },
        description: "Internal Server Error",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const { name, email, password, roleIds } = c.req.valid("json");

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return c.json({ code: 404, message: "User not found" }, 404);
    }

    const builtin = isBuiltinUser(existingUser.flags);

    // Builtin users cannot have their roles changed
    if (builtin && roleIds !== undefined) {
      return c.json(
        { code: 403, message: "Cannot change roles of builtin users" },
        403,
      );
    }

    // Check if email is already taken by another user
    if (email && email !== existingUser.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email },
      });

      if (emailTaken) {
        return c.json({ code: 400, message: "Email already taken" }, 400);
      }
    }

    // Update user directly via Prisma
    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (password) {
      const hashedPassword = await hashPassword(password);
      // Find existing account and update password
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

    // Update custom roles if provided (non-builtin only)
    if (!builtin && roleIds !== undefined) {
      // Remove existing roles
      await prisma.userRole.deleteMany({
        where: { userId: id },
      });

      // Assign new roles
      for (const roleId of roleIds) {
        await userRoleRepository.assign(id, roleId);
      }

      // Derive better-auth role from custom roles (only from admin app)
      const hasAdminRole = await prisma.userRole.findFirst({
        where: {
          userId: id,
          role: {
            appId: ADMIN_APP_ID,
            authRole: "admin",
          },
        },
      });

      const derivedRole = hasAdminRole ? "admin" : "user";

      // Update user's better-auth role if needed
      if (derivedRole !== existingUser.role) {
        await prisma.user.update({
          where: { id },
          data: { role: derivedRole },
        });
      }
    }

    // Return user with roles
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
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
      },
    });

    if (!user) {
      return c.json(
        { code: 500, message: "Failed to fetch updated user" },
        500,
      );
    }

    return c.json(user, 200);
  },
});
