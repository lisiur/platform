import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { auth } from "#lib/auth";
import { prisma } from "#lib/db";
import { requireAdmin } from "#middleware/require-admin";
import { userRoleRepository } from "#repositories/user-role.repository";
import { adminUserSchema, createUserBodySchema, errorSchema } from "./schema";

const ADMIN_APP_ID = "admin";

export const createUser = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["AdminUser"],
    summary: "Create a user with custom roles",
    middleware: requireAdmin,
    request: {
      body: {
        content: {
          "application/json": { schema: createUserBodySchema },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: adminUserSchema } },
        description: "Created user",
      },
      400: {
        content: { "application/json": { schema: errorSchema } },
        description: "Bad Request",
      },
      500: {
        content: { "application/json": { schema: errorSchema } },
        description: "Internal Server Error",
      },
    },
  }),
  handler: async (c) => {
    const { name, email, password, roleIds } = c.req.valid("json");

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return c.json({ code: 400, message: "User already exists" }, 400);
    }

    // Create user via better-auth
    const result = await auth.api.createUser({
      body: {
        name,
        email,
        password,
        role: "user", // Default role, will be derived from custom roles
      },
    });

    if (!result.user) {
      return c.json({ code: 500, message: "Failed to create user" }, 500);
    }

    const userId = result.user.id;

    // Assign custom roles
    if (roleIds.length > 0) {
      for (const roleId of roleIds) {
        await userRoleRepository.assign(userId, roleId);
      }
    }

    // Derive better-auth role from custom roles (only from admin app)
    const hasAdminRole = await prisma.userRole.findFirst({
      where: {
        userId,
        role: {
          appId: ADMIN_APP_ID,
          authRole: "admin",
        },
      },
    });

    const derivedRole = hasAdminRole ? "admin" : "user";

    // Update user's better-auth role if needed
    if (derivedRole !== "user") {
      await prisma.user.update({
        where: { id: userId },
        data: { role: derivedRole },
      });
    }

    // Return user with roles
    const user = await prisma.user.findUnique({
      where: { id: userId },
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
        { code: 500, message: "Failed to fetch created user" },
        500,
      );
    }

    return c.json(user, 200);
  },
});
