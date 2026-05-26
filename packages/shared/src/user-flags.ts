export const PROTECTED_USER_FLAG = "protected";

export function isProtectedUser(flags?: string[] | null) {
  return flags?.includes(PROTECTED_USER_FLAG) ?? false;
}
