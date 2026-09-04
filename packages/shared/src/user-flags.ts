export const BUILTIN_USER_FLAG = "builtin";

/** Set on self-registered users (email/WeChat/Apple) until onboarding completes. */
export const ONBOARDING_PENDING_FLAG = "onboarding-pending";

/**
 * Set on ledger members added directly by an editor/owner without the person
 * ever registering (kids, people who won't install the app). The User row has
 * no email and no credential Account, so it can never sign in; it exists so
 * entries can name it as payer/participant and settlement math can charge it.
 * Claiming it later means attaching a credential Account to the row and
 * clearing this flag.
 */
export const VIRTUAL_USER_FLAG = "virtual";

export function isBuiltinUser(flags?: string[] | null) {
  return flags?.includes(BUILTIN_USER_FLAG) ?? false;
}

export function isVirtualUser(flags?: string[] | null) {
  return flags?.includes(VIRTUAL_USER_FLAG) ?? false;
}

export function hasPendingOnboarding(flags?: string[] | null) {
  return flags?.includes(ONBOARDING_PENDING_FLAG) ?? false;
}
