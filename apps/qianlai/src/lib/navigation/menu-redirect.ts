import { getFirstMenuUrl, useMenuStore } from "@/stores/menu-store";

const QIANLAI_BASE_PATH = "/qianlai";
const PROFILE_PATH = "/profile";

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
