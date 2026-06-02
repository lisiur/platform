"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { appClient, useSession } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { getFirstMenuUrl } from "@/stores/menu-store";

export default function HomePage() {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session.isPending) return;

    if (!session.data) {
      router.replace("/sign-in");
      return;
    }

    withApiFeedback(appClient.api["menu-role"].mine.$get)()
      .then(async (res) => {
        const data = await res.json();
        const firstUrl = getFirstMenuUrl(data.menus);
        if (firstUrl) {
          router.replace(firstUrl);
          return;
        }
        router.replace("/sign-in");
      })
      .catch(() => {
        router.replace("/sign-in");
      });
  }, [session.isPending, session.data, router]);

  return null;
}
