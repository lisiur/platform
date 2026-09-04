import { isBuiltinUser, isVirtualUser } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

export const BUILTIN_USER_ERROR_MESSAGE =
  "Builtin users cannot be deleted or have their roles changed";

export const VIRTUAL_USER_ERROR_MESSAGE =
  "Virtual members are managed through their ledger, not deleted here";

export async function assertUserIsNotBuiltin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { flags: true },
  });

  if (isBuiltinUser(user?.flags)) {
    throw new HTTPException(403, { message: BUILTIN_USER_ERROR_MESSAGE });
  }
}

/**
 * A virtual member's User row anchors historical entry references (payer,
 * participant tags); the global admin delete would cascade those tags away.
 * Virtual members are removed through their ledger's member-removal flow,
 * which keeps referenced rows as the departed-member name source.
 */
export async function assertUserIsNotVirtual(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { flags: true },
  });

  if (isVirtualUser(user?.flags)) {
    throw new HTTPException(400, { message: VIRTUAL_USER_ERROR_MESSAGE });
  }
}
