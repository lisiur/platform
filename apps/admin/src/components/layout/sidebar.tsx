"use client";

import { useStore } from "better-auth/react";
import {
  Building2Icon,
  HomeIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/api/auth-client";

const menuItems = [
  {
    key: "dashboard",
    url: "/dashboard",
    icon: HomeIcon,
  },
  {
    key: "users",
    url: "/users",
    icon: UsersIcon,
  },
  {
    key: "roles",
    url: "/roles",
    icon: ShieldIcon,
  },
  {
    key: "organizations",
    url: "/organizations",
    icon: Building2Icon,
  },
];

const bottomMenuItems = [
  {
    key: "profile",
    url: "/profile",
    icon: UserIcon,
  },
  {
    key: "settings",
    url: "/settings",
    icon: SettingsIcon,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const session = useStore(authClient.useSession);
  const user = session?.data?.user;
  const t = useTranslations("Sidebar");

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.key}>
              <SidebarMenuButton
                isActive={pathname === item.url}
                render={<Link href={item.url} />}
              >
                <item.icon />
                <span>{t(item.key)}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {bottomMenuItems.map((item) => (
            <SidebarMenuItem key={item.key}>
              <SidebarMenuButton
                isActive={pathname === item.url}
                render={<Link href={item.url} />}
              >
                <item.icon />
                <span>{t(item.key)}</span>
                {item.url === "/profile" && user && (
                  <div className="ml-auto relative h-6 w-6 shrink-0 overflow-hidden rounded-sm bg-muted">
                    {user.image ? (
                      <Image
                        src={user.image}
                        alt={user.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-muted-foreground">
                        {initials}
                      </div>
                    )}
                  </div>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
