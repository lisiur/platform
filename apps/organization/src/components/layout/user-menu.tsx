"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarMenuButton,
} from "@repo/ui";
import { ChevronsUpDown, LogOut } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useSession } from "@/lib/api/use-session";

type UserMenuItem = "signOut";

interface UserMenuProps {
  full: boolean;
  items?: UserMenuItem[];
}

export function UserMenu({ full, items }: UserMenuProps) {
  const session = useSession();
  const user = session.data?.user;
  const router = useRouter();
  const t = useTranslations("Sidebar");

  const visible = new Set(items ?? ["signOut"]);
  const showSignOut = visible.has("signOut");

  const initials = useMemo(() => {
    const label = user?.name || user?.email || "";
    return label
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }, [user?.name, user?.email]);

  const handleSignOut = async () => {
    try {
      await session.signOut();
      router.push("/sign-in");
    } catch {
      // Keep the current UI state if sign-out or navigation fails.
    }
  };

  const avatar = (
    <div
      className={`relative flex h-full w-full shrink-0 items-center justify-center overflow-hidden ${
        full ? "rounded-lg" : "rounded-full"
      } ${user?.image ? "" : full ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-muted"}`}
    >
      {user?.image ? (
        <Image
          src={user.image}
          alt={user.name ?? ""}
          fill
          className="object-cover"
          priority
          unoptimized
        />
      ) : (
        <span className="font-semibold text-xs">{initials}</span>
      )}
    </div>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          full ? (
            <SidebarMenuButton
              size="lg"
              className="w-full data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
            />
          ) : undefined
        }
        className={
          full
            ? undefined
            : "inline-flex items-center gap-1.5 rounded-md px-1 py-1 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        }
      >
        <span className="sr-only">User menu</span>
        {full ? (
          <>
            <div className="aspect-square h-8 w-8">{avatar}</div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{user?.name}</span>
              <span className="truncate text-muted-foreground text-xs">
                {user?.email}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto h-4 w-4" />
          </>
        ) : (
          <div className="h-6 w-6">{avatar}</div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={
          full ? "w-[--radix-dropdown-menu-trigger-width] min-w-56" : "w-48"
        }
        side={full ? "top" : "bottom"}
        align={full ? "start" : "end"}
        sideOffset={full ? 4 : undefined}
      >
        {full ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="font-medium text-sm leading-none">{user?.name}</p>
                <p className="text-muted-foreground text-xs leading-none">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
        ) : null}
        {full && showSignOut ? <DropdownMenuSeparator /> : null}
        {showSignOut ? (
          <DropdownMenuItem
            variant="destructive"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="h-4 w-4" />
            {t("signOut")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
