"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Skeleton,
} from "@repo/ui";
import { Folder, icons, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useMenuStore } from "@/stores/menu-store";
import { UserMenu } from "./user-menu";

const iconsRecord = icons as Record<string, LucideIcon>;
const ADMIN_BASE_PATH = "/admin";

function toAppHref(url: string | null): string | null {
  if (!url?.startsWith(ADMIN_BASE_PATH)) return url;
  return url.slice(ADMIN_BASE_PATH.length) || "/";
}

function getIcon(icon: string | null): React.ReactNode | undefined {
  if (!icon) return undefined;
  const IconComponent = iconsRecord[icon];
  if (IconComponent) return <IconComponent className="h-4 w-4" />;
  return <Folder className="h-4 w-4" />;
}

interface SidebarTreeNode {
  id: string;
  name: string;
  code: string;
  icon?: string | null;
  linkType: "GROUP" | "INTERNAL" | "EXTERNAL";
  url: string | null;
  children: SidebarTreeNode[];
}

function SidebarMenuNode({
  node,
  pathname,
}: {
  node: SidebarTreeNode;
  pathname: string;
}) {
  const t = useTranslations("Sidebar");
  const _hasChildren = node.children.length > 0;
  const href = node.linkType === "GROUP" ? undefined : toAppHref(node.url);
  const isActive =
    href && node.linkType === "INTERNAL"
      ? pathname === href || pathname === ADMIN_BASE_PATH + href
      : false;

  const label = t.has(node.code) ? t(node.code) : node.name;

  if (node.linkType === "GROUP") {
    return (
      <>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        {node.children.map((child) => (
          <SidebarMenuNode key={child.id} node={child} pathname={pathname} />
        ))}
      </>
    );
  }

  return (
    <SidebarMenuItem>
      {node.linkType === "EXTERNAL" ? (
        <SidebarMenuButton
          isActive={isActive}
          render={
            <a
              href={href ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
            />
          }
        >
          <span className="shrink-0">
            {node.icon ? getIcon(node.icon) : <span className="h-4 w-4" />}
          </span>
          <span className="truncate">{label}</span>
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton
          isActive={isActive}
          render={<Link href={href ?? "#"} />}
        >
          <span className="shrink-0">
            {node.icon ? getIcon(node.icon) : <span className="h-4 w-4" />}
          </span>
          <span className="truncate">{label}</span>
        </SidebarMenuButton>
      )}
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const t = useTranslations("Sidebar");
  const { treeMenus, loading, fetched, fetchMenus } = useMenuStore();

  const skeletonIds = useRef(
    Array.from({ length: 4 }, () => crypto.randomUUID()),
  );

  useEffect(() => {
    fetchMenus();
  }, [fetchMenus]);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="flex flex-col gap-1 py-2">
              {loading && !fetched ? (
                <SidebarMenuItem className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton
                      key={skeletonIds.current[i]}
                      className="h-8 w-full"
                    />
                  ))}
                </SidebarMenuItem>
              ) : fetched && treeMenus.length === 0 ? (
                <SidebarMenuItem className="py-4 text-center text-sm text-muted-foreground">
                  {t("noMenus")}
                </SidebarMenuItem>
              ) : (
                treeMenus.map((node) => (
                  <SidebarMenuNode
                    key={node.id}
                    node={node}
                    pathname={pathname}
                  />
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu full />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
