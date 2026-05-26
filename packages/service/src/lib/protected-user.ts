import { isProtectedUser } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

export const PROTECTED_USER_ERROR_MESSAGE =
  "Protected users cannot be deleted or have their roles changed";

export async function assertUserIsNotProtected(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { flags: true },
  });

  if (isProtectedUser(user?.flags)) {
    throw new HTTPException(403, { message: PROTECTED_USER_ERROR_MESSAGE });
  }
}
