export const BUILTIN_USER_FLAG = "builtin";

/** Set on self-registered users (email/WeChat/Apple) until onboarding completes. */
export const ONBOARDING_PENDING_FLAG = "onboarding-pending";

export function isBuiltinUser(flags?: string[] | null) {
  return flags?.includes(BUILTIN_USER_FLAG) ?? false;
}

export function hasPendingOnboarding(flags?: string[] | null) {
  return flags?.includes(ONBOARDING_PENDING_FLAG) ?? false;
}
