"use client";

import { Building2, PanelLeftIcon } from "lucide-react";
import Image from "next/image";
import { useCurrentApp } from "@/hooks/use-current-app";
import { useCurrentOrganization } from "@/hooks/use-current-organization";
import { useSession } from "@/lib/api/use-session";
import { UserMenu } from "./user-menu";

export function Header({ className }: { className?: string }) {
  const { app } = useCurrentApp();
  const { organization } = useCurrentOrganization();
  const { data: session } = useSession();

  const label = organization?.name ?? app?.name ?? "";
  const logo = organization?.logo ?? app?.logo ?? null;

  return (
    <header
      className={`${className} flex items-center border-b bg-background px-4 md:px-6`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 md:hidden [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
          onClick={() => window.dispatchEvent(new Event("sidebar-toggle"))}
        >
          <PanelLeftIcon />
          <span className="sr-only">Toggle Sidebar</span>
        </button>
        {logo ? (
          <Image
            src={logo}
            alt={label}
            width={24}
            height={24}
            className="shrink-0 rounded"
            priority
            unoptimized
          />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded bg-muted">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <span className="font-semibold text-lg">{label}</span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {session ? <UserMenu full={false} items={["signOut"]} /> : null}
      </div>
    </header>
  );
}
