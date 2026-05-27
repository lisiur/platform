export const BUILTIN_ROLE_FLAG = "builtin";

export function isBuiltinRole(flags?: string[] | null) {
  return flags?.includes(BUILTIN_ROLE_FLAG) ?? false;
}
