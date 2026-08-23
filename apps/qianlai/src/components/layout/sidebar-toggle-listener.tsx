"use client";

import { useSidebar } from "@repo/ui";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function SidebarToggleListener() {
  const { toggleSidebar, setOpenMobile } = useSidebar();
  const pathname = usePathname();

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on navigation to close the mobile drawer
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  useEffect(() => {
    const handler = () => toggleSidebar();
    window.addEventListener("sidebar-toggle", handler);
    return () => window.removeEventListener("sidebar-toggle", handler);
  }, [toggleSidebar]);

  return null;
}
