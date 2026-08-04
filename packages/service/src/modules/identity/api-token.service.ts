import { HTTPException } from "hono/http-exception";
import type { ApiToken } from "#generated/prisma/client";
import {
  generateApiTokenString,
  hashApiToken,
  tokenPrefixOf,
  tokenSuffixOf,
} from "#lib/api-token";
import { prisma } from "#lib/db";
import { getAllUserPermissionCodes } from "#modules/access-control/public";

export type ApiTokenPublic = Omit<ApiToken, "tokenHash">;

function toPublic(token: ApiToken): ApiTokenPublic {
  const { tokenHash: _tokenHash, ...rest } = token;
  return rest;
}

export type CreateApiTokenInput = {
  ownerId: string;
  name: string;
  scopes: string[];
  scope?: string | null;
  expiresAt?: string | null;
};

async function assertScopesWithinOwner(
  ownerId: string,
  scopes: string[],
  scope: string,
): Promise<void> {
  const ownerPerms = await getAllUserPermissionCodes(ownerId, scope);
  const invalid = scopes.filter((s) => !ownerPerms.includes(s));
  if (invalid.length > 0) {
    throw new HTTPException(403, {
      message: "Requested scopes exceed your permissions",
    });
  }
}

export async function createApiTokenForUser(
  input: CreateApiTokenInput,
): Promise<{ token: string; record: ApiTokenPublic }> {
  await assertScopesWithinOwner(
    input.ownerId,
    input.scopes,
    input.scope ?? "system",
  );

  const tokenString = generateApiTokenString();
  let expiresAt: Date | null = null;
  if (input.expiresAt) {
    expiresAt = new Date(input.expiresAt);
    if (expiresAt.getTime() <= Date.now()) {
      throw new HTTPException(400, {
        message: "Expiry date must be in the future",
      });
    }
  }

  const record = await prisma.apiToken.create({
    data: {
      tokenHash: hashApiToken(tokenString),
      tokenPrefix: tokenPrefixOf(tokenString),
      tokenSuffix: tokenSuffixOf(tokenString),
      name: input.name,
      ownerId: input.ownerId,
      scopes: input.scopes,
      scope: input.scope ?? null,
      expiresAt,
    },
  });

  return { token: tokenString, record: toPublic(record) };
}

export async function listApiTokensForUser(
  ownerId: string,
): Promise<ApiTokenPublic[]> {
  const tokens = await prisma.apiToken.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  });
  return tokens.map(toPublic);
}

export async function getApiTokenForUser(
  ownerId: string,
  id: string,
): Promise<ApiTokenPublic> {
  const token = await prisma.apiToken.findFirst({ where: { id, ownerId } });
  if (!token) {
    throw new HTTPException(404, { message: "Token not found" });
  }
  return toPublic(token);
}

export type UpdateApiTokenInput = {
  name?: string;
  enabled?: boolean;
  scopes?: string[];
};

export async function updateApiTokenForUser(
  ownerId: string,
  id: string,
  data: UpdateApiTokenInput,
): Promise<ApiTokenPublic> {
  const existing = await prisma.apiToken.findFirst({
    where: { id, ownerId },
  });
  if (!existing) {
    throw new HTTPException(404, { message: "Token not found" });
  }

  if (data.scopes) {
    await assertScopesWithinOwner(
      ownerId,
      data.scopes,
      existing.scope ?? "system",
    );
  }

  const updated = await prisma.apiToken.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.enabled !== undefined && { enabled: data.enabled }),
      ...(data.scopes !== undefined && { scopes: data.scopes }),
    },
  });
  return toPublic(updated);
}

export async function deleteApiTokenForUser(
  ownerId: string,
  id: string,
): Promise<ApiTokenPublic> {
  const existing = await prisma.apiToken.findFirst({
    where: { id, ownerId },
  });
  if (!existing) {
    throw new HTTPException(404, { message: "Token not found" });
  }
  await prisma.apiToken.delete({ where: { id } });
  return toPublic(existing);
}
