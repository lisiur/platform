export const BUILTIN_ACCOUNT_FLAG = "builtin";
export const ADJUSTMENT_OFFSET_ACCOUNT_FLAG = "adjustmentOffset";
export const DEFAULT_DEBIT_ACCOUNT_FLAG = "defaultDebit";
export const DEFAULT_CREDIT_ACCOUNT_FLAG = "defaultCredit";

export type AccountFlag =
  | typeof BUILTIN_ACCOUNT_FLAG
  | typeof ADJUSTMENT_OFFSET_ACCOUNT_FLAG
  | typeof DEFAULT_DEBIT_ACCOUNT_FLAG
  | typeof DEFAULT_CREDIT_ACCOUNT_FLAG;

export function hasAccountFlag(
  flags: string[] | null | undefined,
  flag: AccountFlag,
) {
  return flags?.includes(flag) ?? false;
}

export function isBuiltinAccount(flags?: string[] | null) {
  return hasAccountFlag(flags, BUILTIN_ACCOUNT_FLAG);
}
