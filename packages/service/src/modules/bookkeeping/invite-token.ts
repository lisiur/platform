import { HTTPException } from "hono/http-exception";
import { sign, verify } from "hono/jwt";

/**
 * Stateless invite codes. An "invite code" is a short-lived JWT the server
 * signs on demand — nothing is stored, so codes need no listing, no
 * revocation, and no cleanup: they simply expire.
 *
 * Claims:
 * - `sub`  — creator userId (audit only; redemption uses the session user)
 * - `aud`  — fixed "qianlai-invite" so tokens can't be confused with other
 *            JWTs signed with the same secret
 * - `ledgerId` — ledger the invite grants access to
 * - `projectId` — present = project invite (redeemer joins as `guest`,
 *            scoped to this project)
 * - `role` — ledger role granted for ledger-wide invites ("editor" |
 *            "viewer"; project invites always "guest")
 * - `iat`/`exp` — INVITE_TTL_SECONDS lifetime
 */

export const INVITE_TTL_SECONDS = 60;
export const INVITE_AUDIENCE = "qianlai-invite";

export type InviteRole = "editor" | "viewer" | "guest";

export type InviteClaims = {
  sub: string;
  ledgerId: string;
  projectId?: string;
  role: InviteRole;
};

const INVITE_ROLES: readonly InviteRole[] = ["editor", "viewer", "guest"];

function inviteSecret(): string {
  const secret = process.env.QIANLAI_INVITE_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to mint/verify invites: QIANLAI_INVITE_SECRET must be set in production",
    );
  }
  // Dev/test fallback: codes only need to survive until their 60s expiry,
  // so a per-boot secret is fine locally.
  return "qianlai-invite-dev-secret";
}

export async function mintInviteToken(
  claims: InviteClaims,
): Promise<{ token: string; expiresAt: Date }> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + INVITE_TTL_SECONDS;
  const token = await sign(
    {
      aud: INVITE_AUDIENCE,
      sub: claims.sub,
      ledgerId: claims.ledgerId,
      ...(claims.projectId ? { projectId: claims.projectId } : {}),
      role: claims.role,
      iat,
      exp,
    },
    inviteSecret(),
  );
  return { token, expiresAt: new Date(exp * 1000) };
}

export async function verifyInviteToken(token: string): Promise<InviteClaims> {
  let payload: Record<string, unknown>;
  try {
    payload = await verify(token, inviteSecret(), "HS256");
  } catch (err) {
    if (err instanceof Error && err.name === "JwtTokenExpired") {
      throw new HTTPException(400, {
        message: "This invite code has expired",
      });
    }
    throw new HTTPException(400, {
      message: "This invite code is invalid",
    });
  }
  const claims = decodeClaims(payload);
  if (!claims) {
    throw new HTTPException(400, {
      message: "This invite code is invalid",
    });
  }
  return claims;
}

/** Validates shape and claim consistency; signature was checked by verify. */
function decodeClaims(payload: Record<string, unknown>): InviteClaims | null {
  if (payload.aud !== INVITE_AUDIENCE) return null;
  const { sub, ledgerId, role, projectId } = payload;
  if (typeof sub !== "string" || typeof ledgerId !== "string") return null;
  if (!ledgerId) return null;
  if (typeof role !== "string" || !INVITE_ROLES.includes(role as InviteRole)) {
    return null;
  }
  if (projectId !== undefined) {
    // Project invites grant the guest role and only the guest role.
    if (typeof projectId !== "string" || !projectId) return null;
    if (role !== "guest") return null;
  } else if (role === "guest") {
    // Ledger-wide invites never grant guest — guests are project-scoped.
    return null;
  }
  return {
    sub,
    ledgerId,
    ...(projectId ? { projectId: projectId as string } : {}),
    role: role as InviteRole,
  };
}
