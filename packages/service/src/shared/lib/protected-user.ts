import { isBuiltinUser } from "@repo/shared";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

export const BUILTIN_USER_ERROR_MESSAGE =
  "Builtin users cannot be deleted or have their roles changed";

export async function assertUserIsNotBuiltin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { flags: true },
  });

  if (isBuiltinUser(user?.flags)) {
    throw new HTTPException(403, { message: BUILTIN_USER_ERROR_MESSAGE });
  }
}
