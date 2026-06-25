"use client";

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
  SidebarMenuButton,
  Switch,
} from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
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
import { useSwitchOrganization } from "@/hooks/use-switch-organization";
import { appClient } from "@/lib/api";
import { useSession } from "@/lib/api/use-session";

type UserMenuItem =
  | "profile"
  | "switchOrganization"
  | "theme"
  | "locale"
  | "registerOrganization"
  | "signOut";

interface UserMenuProps {
  full: boolean;
  items?: UserMenuItem[];
}

const locales: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
];

export function UserMenu({ full, items }: UserMenuProps) {
  const session = useSession();
  const user = session.data?.user;
  const router = useRouter();
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const t = useTranslations("Sidebar");
  const th = useTranslations("Header");

  const visible = new Set(
    items ?? [
      "profile",
      "switchOrganization",
      "theme",
      "locale",
      "registerOrganization",
      "signOut",
    ],
  );

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

  function handleLocaleChange(value: string) {
    // biome-ignore lint/suspicious/noDocumentCookie: simple cookie setter for locale
    document.cookie = `locale=${value};path=/;max-age=31536000`;
    router.refresh();
  }

  const showLabel = full;
  const showProfile = visible.has("profile");
  const showSwitch = visible.has("switchOrganization");
  const showRegisterOrg = visible.has("registerOrganization");
  const showUtilities = visible.has("theme") || visible.has("locale");
  const showSignOut = visible.has("signOut");

  const { switchOrg, activatingId, activeOrganizationId } =
    useSwitchOrganization();

  const { data: mineData } = useQuery({
    queryKey: ["organizations", "mine"],
    queryFn: async () => {
      const res = await appClient.api.organizations.mine.$get();
      if (!res.ok) throw new Error("Failed to load organizations");
      return (await res.json()) as {
        organizations: {
          id: string;
          name: string;
          slug: string;
          logo?: string | null;
        }[];
      };
    },
    enabled: !!user,
  });

  const organizations = mineData?.organizations ?? [];
  const canSwitch = showSwitch && organizations.length > 1;

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
        {showLabel && (
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
        )}
        {showLabel &&
          (showProfile ||
            canSwitch ||
            showRegisterOrg ||
            showUtilities ||
            showSignOut) && <DropdownMenuSeparator />}
        {showProfile && (
          <DropdownMenuItem render={<Link href="/profile" />}>
            <UserIcon />
            {t("profile")}
          </DropdownMenuItem>
        )}
        {canSwitch && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Building2 className="size-4" />
              <span>{t("switchOrganization")}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {organizations.map((org) => (
                <DropdownMenuCheckboxItem
                  key={org.id}
                  checked={org.id === activeOrganizationId}
                  disabled={activatingId !== null}
                  onClick={() => {
                    if (org.id !== activeOrganizationId) {
                      void switchOrg(org, t("switchSuccess"));
                    }
                  }}
                >
                  {org.logo ? (
                    <Image
                      src={org.logo}
                      alt={org.name}
                      width={16}
                      height={16}
                      className="shrink-0 rounded object-cover"
                      unoptimized
                    />
                  ) : (
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  {org.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {(showProfile || canSwitch) && showRegisterOrg && (
          <DropdownMenuSeparator />
        )}
        {showRegisterOrg && (
          <DropdownMenuItem render={<Link href="/register-organization" />}>
            <Building2 />
            {t("registerOrganization")}
          </DropdownMenuItem>
        )}
        {(showProfile || canSwitch || showRegisterOrg) && showUtilities && (
          <DropdownMenuSeparator />
        )}
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
        {(showLabel ||
          showProfile ||
          canSwitch ||
          showRegisterOrg ||
          showUtilities) &&
          showSignOut && <DropdownMenuSeparator />}
        {showSignOut && (
          <DropdownMenuItem
            variant="destructive"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="h-4 w-4" />
            {t("signOut")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
