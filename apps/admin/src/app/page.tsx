"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { appClient, useSession } from "@/lib/api";
import { apiWithFeedback } from "@/lib/api/utils";
import { getFirstMenuUrl } from "@/lib/menu-utils";

export default function HomePage() {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session.isPending) return;

    if (!session.data) {
      router.replace("/sign-in");
      return;
    }

    apiWithFeedback(appClient.api["menu-role"].mine.$get)()
      .then(async (res) => {
        const data = await res.json();
        const firstUrl = getFirstMenuUrl(data.menus);
        if (firstUrl) {
          router.replace(firstUrl);
          return;
        }
        router.replace("/");
      })
      .catch(() => {
        router.replace("/");
      });
  }, [session.isPending, session.data, router]);

  return null;
}
