import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ApiTokenPrincipal } from "#lib/api-token";
import { getApiTokenByBearer } from "#lib/api-token";
import { orgScope, SYSTEM_SCOPE } from "#lib/scope";
import type { AuthType } from "#lib/session";
import { getSessionFromHeaders } from "#lib/session";

export type UserPrincipal = { kind: "user" } & AuthType;
export type TokenPrincipal = { kind: "token" } & ApiTokenPrincipal;

export type Principal = UserPrincipal | TokenPrincipal;

export async function trySession(c: Context): Promise<AuthType | null> {
  return getSessionFromHeaders(c.req.raw.headers);
}

export async function requireSession(c: Context): Promise<UserPrincipal> {
  const session = await trySession(c);
  if (!session) {
    throw new HTTPException(401, {
      message: "Unauthorized",
    });
  }
  return { kind: "user", ...session };
}

function getBearerToken(headers: Headers): string | null {
  const header = headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export async function tryBearerToken(
  c: Context,
): Promise<ApiTokenPrincipal | null> {
  const raw = getBearerToken(c.req.raw.headers);
  return getApiTokenByBearer(raw);
}

export async function requireBearerToken(
  c: Context,
): Promise<ApiTokenPrincipal> {
  const principal = await tryBearerToken(c);
  if (!principal) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  return principal;
}

export async function tryPrincipal(c: Context): Promise<Principal | null> {
  const session = await trySession(c);
  if (session) {
    const principal: Principal = { kind: "user", ...session };
    c.set("principal", principal);
    return principal;
  }

  const token = await tryBearerToken(c);
  if (token) {
    const principal: Principal = { kind: "token", ...token };
    c.set("principal", principal);
    return principal;
  }

  return null;
}

export async function requirePrincipal(c: Context): Promise<Principal> {
  const principal = await tryPrincipal(c);
  if (!principal) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  return principal;
}

export function getPrincipalUserId(principal: Principal): string {
  if (principal.kind === "user") {
    return principal.user.id;
  }
  return principal.ownerId;
}

/**
 * Resolves the caller's effective scope string: an org scope (`org:<id>`)
 * when an organization is active, otherwise the platform scope (`system`).
 * API tokens use their bound `scope` field directly.
 */
export function principalScope(principal: Principal): string {
  if (principal.kind === "user") {
    const orgId = principal.session.activeOrganizationId;
    return orgId ? orgScope(orgId) : SYSTEM_SCOPE;
  }
  return principal.token.scope ?? SYSTEM_SCOPE;
}
