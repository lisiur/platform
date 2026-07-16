export { RoleScopeType } from "#generated/prisma/client";

export const PLATFORM_SCOPE_ID = "" as const;

export function scopeIdOrDefault(scopeId?: string | null): string {
  return scopeId ?? PLATFORM_SCOPE_ID;
}
