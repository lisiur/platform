export const BUILTIN_USER_FLAG = "builtin";

export function isBuiltinUser(flags?: string[] | null) {
  return flags?.includes(BUILTIN_USER_FLAG) ?? false;
}
