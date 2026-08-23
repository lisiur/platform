/**
 * Loose structural checks for Prisma error codes: tests throw plain objects,
 * so these must not depend on the PrismaClientKnownRequestError class.
 */
function isPrismaErrorCode(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === code
  );
}

/** Foreign-key constraint violation (a referenced row no longer exists). */
export function isForeignKeyViolation(err: unknown): boolean {
  return isPrismaErrorCode(err, "P2003");
}

/** Unique-constraint violation (a duplicate key was inserted concurrently). */
export function isUniqueViolation(err: unknown): boolean {
  return isPrismaErrorCode(err, "P2002");
}
