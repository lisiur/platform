"use client";

import { PanelLeftIcon } from "lucide-react";
import Image from "next/image";
import { useCurrentApp } from "@/hooks/use-current-app";
import { useSession } from "@/lib/api/use-session";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

export function Header({ className }: { className?: string }) {
  const { app } = useCurrentApp();
  const { data: session } = useSession();

  return (
    <header
      className={`${className} flex items-center border-b bg-background px-4 md:px-6`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-7 w-7"
          onClick={() => window.dispatchEvent(new Event("sidebar-toggle"))}
        >
          <PanelLeftIcon />
          <span className="sr-only">Toggle Sidebar</span>
        </button>
        {app?.logo ? (
          <Image
            src={app.logo}
            alt={app.name}
            width={24}
            height={24}
            className="shrink-0 rounded"
            priority
            unoptimized
          />
        ) : null}
        <span className="text-lg font-semibold">{app?.name ?? ""}</span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {session ? <NotificationBell /> : null}
        <UserMenu
          full={false}
          items={
            session
              ? ["userInfo", "profile", "theme", "locale", "signOut"]
              : ["theme", "locale"]
          }
        />
      </div>
    </header>
  );
}
