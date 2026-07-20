import { createHash, randomBytes } from "node:crypto";
import type { ApiToken } from "#generated/prisma/client";
import { prisma } from "#lib/db";

const TOKEN_PREFIX = "tk-";

export function generateApiTokenString(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenPrefixOf(token: string): string {
  return token.slice(0, 8);
}

export function tokenSuffixOf(token: string): string {
  return token.slice(-4);
}

export type ApiTokenPrincipal = {
  token: ApiToken;
  scopes: string[];
  ownerId: string;
  ownerName: string;
};

function isOwnerValid(owner: {
  banned: boolean | null;
  banExpires: Date | null;
}): boolean {
  if (!owner.banned) return true;
  if (owner.banExpires && owner.banExpires.getTime() <= Date.now()) return true;
  return false;
}

export async function getApiTokenByBearer(
  raw: string | null,
): Promise<ApiTokenPrincipal | null> {
  if (!raw) return null;

  const tokenHash = hashApiToken(raw);
  const result = await prisma.apiToken.findUnique({
    where: { tokenHash },
    include: { owner: true },
  });
  if (!result) return null;

  if (!result.enabled) return null;
  if (result.expiresAt && result.expiresAt.getTime() <= Date.now()) return null;
  if (!isOwnerValid(result.owner)) return null;

  const { owner, ...token } = result;

  await prisma.apiToken
    .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
    .catch(() => null);

  return {
    token,
    scopes: token.scopes,
    ownerId: owner.id,
    ownerName: owner.name,
  };
}
