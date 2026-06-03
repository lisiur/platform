"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/api";
import { getFirstMenuUrl, useMenuStore } from "@/stores/menu-store";

export default function HomePage() {
  const router = useRouter();
  const session = useSession();
  const { fetched, fetchMenus } = useMenuStore();

  useEffect(() => {
    if (session.isPending) return;

    if (!session.data) {
      router.replace("/sign-in");
      return;
    }

    if (fetched) {
      const { menus } = useMenuStore.getState();
      const firstUrl = getFirstMenuUrl(menus);
      if (firstUrl) {
        router.replace(firstUrl);
        return;
      }
      router.replace("/profile");
      return;
    }

    fetchMenus()
      .then(() => {
        const { menus } = useMenuStore.getState();
        const firstUrl = getFirstMenuUrl(menus);
        if (firstUrl) {
          router.replace(firstUrl);
          return;
        }
        router.replace("/profile");
      })
      .catch(() => {
        router.replace("/sign-in");
      });
  }, [session.isPending, session.data, router, fetched, fetchMenus]);

  return null;
}
