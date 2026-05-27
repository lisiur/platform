import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { AuthType } from "#lib/auth";
import { auth } from "#lib/auth";
import { assertUserIsNotBuiltin } from "#lib/protected-user";

const authRoutes = new OpenAPIHono<{ Bindings: AuthType }>({ strict: false });

const protectedUserAuthPaths = new Set([
  "/admin/remove-user",
  "/admin/set-role",
]);

function matchesAuthPath(path: string, authPath: string) {
  return path === authPath || path.endsWith(authPath);
}

function getUserIdFromBody(body: unknown) {
  if (!body || typeof body !== "object" || !("userId" in body)) {
    return null;
  }

  const userId = body.userId;
  return typeof userId === "string" || typeof userId === "number"
    ? String(userId)
    : null;
}

authRoutes.use("/*", async (c, next) => {
  if (
    ![...protectedUserAuthPaths].some((path) =>
      matchesAuthPath(c.req.path, path),
    )
  ) {
    return next();
  }

  const body = await c.req.raw
    .clone()
    .json()
    .catch(() => null);
  const userId = getUserIdFromBody(body);

  if (!userId) {
    return next();
  }

  await assertUserIsNotBuiltin(userId);
  return next();
});

authRoutes.use("/*", async (c, next) => {
  const isCreateUser = matchesAuthPath(c.req.path, "/admin/create-user");
  const isUpdateUser = matchesAuthPath(c.req.path, "/admin/update-user");

  if (!isCreateUser && !isUpdateUser) {
    return next();
  }

  const body = await c.req.raw
    .clone()
    .json()
    .catch(() => null);
  const userId = getUserIdFromBody(body);
  const data = !!body?.data && typeof body.data === "object" ? body.data : null;

  if (data && Object.hasOwn(data, "flags")) {
    throw new HTTPException(403, {
      message: "User flags cannot be modified through this endpoint",
    });
  }

  if (isUpdateUser && userId && data && Object.hasOwn(data, "role")) {
    await assertUserIsNotBuiltin(userId);
  }

  return next();
});

authRoutes.on(["POST", "GET"], "/*", (c) => {
  return auth.handler(c.req.raw);
});

export { authRoutes };
