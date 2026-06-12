"use client";

import { useSidebar } from "@repo/ui";
import { useEffect } from "react";

export function SidebarToggleListener() {
  const { toggleSidebar } = useSidebar();

  useEffect(() => {
    const handler = () => toggleSidebar();
    window.addEventListener("sidebar-toggle", handler);
    return () => window.removeEventListener("sidebar-toggle", handler);
  }, [toggleSidebar]);

  return null;
}
