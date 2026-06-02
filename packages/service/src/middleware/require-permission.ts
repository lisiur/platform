import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { getSession } from "#services/auth.service";
import { getUserPermissions } from "#services/role-permission.service";

function matchSinglePermission(pattern: string, permission: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("::*")) {
    const scope = pattern.slice(0, -3);
    return permission === pattern || permission.startsWith(`${scope}::`);
  }
  return pattern === permission;
}

function matchPermission(
  userPermissions: string[],
  requiredPermission: string,
): boolean {
  const negations: string[] = [];
  const positives: string[] = [];

  for (const perm of userPermissions) {
    if (perm.startsWith("!")) {
      negations.push(perm.slice(1));
    } else {
      positives.push(perm);
    }
  }

  for (const neg of negations) {
    if (matchSinglePermission(neg, requiredPermission)) {
      return false;
    }
  }

  for (const pos of positives) {
    if (matchSinglePermission(pos, requiredPermission)) {
      return true;
    }
  }

  return false;
}

export function requirePermission(
  permission: string | { and?: string[]; or?: string[] },
) {
  return createMiddleware(async (c, next) => {
    const session = await getSession(c.req.raw.headers);
    if (!session?.user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const userPermissions = await getUserPermissions(session.user.id);

    let hasPermission: boolean;

    if (typeof permission === "string") {
      hasPermission = matchPermission(userPermissions, permission);
    } else if (permission.and) {
      hasPermission = permission.and.every((p) =>
        matchPermission(userPermissions, p),
      );
    } else if (permission.or) {
      hasPermission = permission.or.some((p) =>
        matchPermission(userPermissions, p),
      );
    } else {
      hasPermission = false;
    }

    if (!hasPermission) {
      throw new HTTPException(403, { message: "Permission denied" });
    }

    return next();
  });
}
