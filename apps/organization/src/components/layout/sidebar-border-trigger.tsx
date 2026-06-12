"use client";

import { useSidebar } from "@repo/ui";
import { ChevronsLeftIcon } from "lucide-react";

export function SidebarBorderTrigger() {
  const { open, isMobile } = useSidebar();

  if (isMobile) return null;

  return (
    <button
      type="button"
      className="fixed top-1/2 z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-all duration-200 ease-linear hover:bg-accent hover:text-accent-foreground"
      style={{
        left: open ? "var(--sidebar-width)" : "var(--sidebar-width-icon)",
      }}
      onClick={() => window.dispatchEvent(new Event("sidebar-toggle"))}
    >
      <ChevronsLeftIcon
        className={`h-3 w-3 flex-shrink-0 transition-transform ${open ? "" : "rotate-180"}`}
      />
    </button>
  );
}
