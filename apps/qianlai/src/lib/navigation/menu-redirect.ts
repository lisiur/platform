import { hasPendingOnboarding } from "@repo/shared";
import { getFirstMenuUrl, useMenuStore } from "@/stores/menu-store";

const QIANLAI_BASE_PATH = "/qianlai";
const PROFILE_PATH = "/profile";
const ONBOARDING_PATH = "/onboarding";

interface Router {
  push: (href: string) => void;
}

export function toAppInternalPath(url: string | null): string | null {
  if (!url) return null;

  const href =
    url === QIANLAI_BASE_PATH || url.startsWith(`${QIANLAI_BASE_PATH}/`)
      ? url.slice(QIANLAI_BASE_PATH.length) || "/"
      : url;

  if (!href.startsWith("/") || href.startsWith("//")) return null;
  return href;
}

/**
 * Post-auth destination: first-time users (onboarding flag still set) go to
 * the guide page; everyone else lands on their first menu or the profile.
 */
export async function redirectAfterAuth(
  router: Router,
  refetchMenus: () => Promise<void>,
  flags: string[] | undefined | null,
) {
  if (hasPendingOnboarding(flags)) {
    router.push(ONBOARDING_PATH);
    return;
  }
  await redirectToFirstMenuOrProfile(router, refetchMenus);
}

export async function redirectToFirstMenuOrProfile(
  router: Router,
  refetchMenus: () => Promise<void>,
) {
  try {
    await refetchMenus();
    const firstUrl = getFirstMenuUrl(useMenuStore.getState().menus);
    const firstPath = toAppInternalPath(firstUrl);
    if (firstPath) {
      router.push(firstPath);
      return;
    }
  } catch {
    // Fall back to profile when menu loading fails.
  }

  router.push(PROFILE_PATH);
}
