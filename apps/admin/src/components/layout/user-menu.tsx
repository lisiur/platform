"use client";

import {
  ChevronsUpDown,
  LanguagesIcon,
  LogOut,
  Moon,
  Sun,
  UserIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Fragment, useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/lib/api";

type UserMenuItem = "profile" | "theme" | "locale" | "signOut";

interface UserMenuProps {
  full: boolean;
  items?: UserMenuItem[];
  avatarRadius?: "rounded" | "circle";
}

const locales: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
];

export function UserMenu({ full, items, avatarRadius }: UserMenuProps) {
  const session = useSession();
  const user = session.data?.user;
  const router = useRouter();
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const t = useTranslations("Sidebar");
  const th = useTranslations("Header");

  const visible = new Set(items ?? ["profile", "theme", "locale", "signOut"]);
  const radius = avatarRadius ?? (full ? "rounded" : "circle");
  const radiusClass = radius === "circle" ? "rounded-full" : "rounded-lg";

  const initials = useMemo(
    () =>
      user?.name
        ?.split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) ?? "",
    [user?.name],
  );

  const handleSignOut = async () => {
    await session.signOut();
    router.push("/sign-in");
  };

  function handleLocaleChange(value: string) {
    // biome-ignore lint/suspicious/noDocumentCookie: simple cookie setter for locale
    document.cookie = `locale=${value};path=/;max-age=31536000`;
    router.refresh();
  }

  const showLabel = full;
  const showProfile = visible.has("profile");
  const showUtilities = visible.has("theme") || visible.has("locale");
  const showSignOut = visible.has("signOut");

  const avatar = (
    <div
      className={`relative flex h-full w-full shrink-0 items-center justify-center overflow-hidden ${radiusClass} ${
        user?.image
          ? ""
          : full
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "bg-muted"
      }`}
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
        <span className="text-xs font-semibold">{initials}</span>
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
            : "inline-flex items-center gap-1.5 rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring px-1 py-1"
        }
      >
        <span className="sr-only">User menu</span>
        {full ? (
          <>
            <div className="aspect-square h-8 w-8">{avatar}</div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{user?.name}</span>
              <span className="truncate text-xs text-muted-foreground">
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
        {showLabel && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium leading-none">{user?.name}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
        )}
        {showLabel && (showProfile || showUtilities || showSignOut) && (
          <DropdownMenuSeparator />
        )}
        {showProfile && (
          <DropdownMenuItem render={<Link href="/profile" />}>
            <UserIcon />
            {t("profile")}
          </DropdownMenuItem>
        )}
        {showProfile && showUtilities && <DropdownMenuSeparator />}
        {showUtilities && (
          <Fragment>
            {visible.has("theme") && (
              <DropdownMenuItem closeOnClick={false} className="cursor-default">
                <div className="flex items-center justify-between w-full">
                  <span className="flex items-center gap-1.5">
                    {isDark ? (
                      <Moon className="size-4" />
                    ) : (
                      <Sun className="size-4" />
                    )}
                    {th("appearance")}
                  </span>
                  <Switch
                    checked={isDark}
                    onCheckedChange={(checked) =>
                      setTheme(checked ? "dark" : "light")
                    }
                  />
                </div>
              </DropdownMenuItem>
            )}
            {visible.has("locale") && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <LanguagesIcon className="size-4 text-muted-foreground" />
                  <span>{th("language")}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {locales.map((l) => (
                    <DropdownMenuCheckboxItem
                      key={l.value}
                      checked={locale === l.value}
                      onClick={() => handleLocaleChange(l.value)}
                    >
                      {l.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
          </Fragment>
        )}
        {(showLabel || showProfile || showUtilities) && showSignOut && (
          <DropdownMenuSeparator />
        )}
        {showSignOut && (
          <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            {t("signOut")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
