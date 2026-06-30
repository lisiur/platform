"use client";

import {
  cn,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Skeleton,
} from "@repo/ui";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  icons,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useMenuStore } from "@/stores/menu-store";
import { UserMenu } from "./user-menu";

const iconsRecord = icons as Record<string, LucideIcon>;
const ORGANIZATION_BASE_PATH = "/organization";

function toInternalHref(url: string | null): string | null {
  if (!url) return null;

  const href =
    url === ORGANIZATION_BASE_PATH ||
    url.startsWith(`${ORGANIZATION_BASE_PATH}/`)
      ? url.slice(ORGANIZATION_BASE_PATH.length) || "/"
      : url;

  if (!href.startsWith("/") || href.startsWith("//")) return null;
  return href;
}

function toExternalHref(url: string | null): string | null {
  if (!url) return null;

  try {
    const href = new URL(url);
    return href.protocol === "http:" || href.protocol === "https:"
      ? href.href
      : null;
  } catch {
    return null;
  }
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
  level,
  pathname,
  expandedIds,
  onToggle,
}: {
  node: SidebarTreeNode;
  level: number;
  pathname: string;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("Sidebar");
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const href =
    node.linkType === "INTERNAL"
      ? toInternalHref(node.url)
      : node.linkType === "EXTERNAL"
        ? toExternalHref(node.url)
        : null;
  const prefixedHref =
    node.linkType === "INTERNAL" && href
      ? `${ORGANIZATION_BASE_PATH}${href === "/" ? "" : href}`
      : null;
  const isActive =
    href && prefixedHref
      ? pathname === href || pathname === prefixedHref
      : false;

  const label = t.has(node.code) ? t(node.code) : node.name;

  return (
    <SidebarMenuItem>
      {hasChildren ? (
        <>
          <SidebarMenuButton
            isActive={isActive}
            onClick={() => onToggle(node.id)}
          >
            <span className="shrink-0">
              {node.icon ? (
                getIcon(node.icon)
              ) : isExpanded ? (
                <FolderOpen className="h-4 w-4" />
              ) : (
                <Folder className="h-4 w-4" />
              )}
            </span>
            <span className="truncate">{label}</span>
            <ChevronRight
              className={cn(
                "ml-auto h-4 w-4 transition-transform",
                isExpanded && "rotate-90",
              )}
            />
          </SidebarMenuButton>
          {isExpanded ? (
            <SidebarMenu className="ml-2">
              {node.children.map((child) => (
                <SidebarMenuNode
                  key={child.id}
                  node={child}
                  level={level + 1}
                  pathname={pathname}
                  expandedIds={expandedIds}
                  onToggle={onToggle}
                />
              ))}
            </SidebarMenu>
          ) : null}
        </>
      ) : node.linkType === "EXTERNAL" && href ? (
        <SidebarMenuButton
          isActive={isActive}
          render={
            <a
              href={href}
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
      ) : node.linkType === "INTERNAL" && href ? (
        <SidebarMenuButton isActive={isActive} render={<Link href={href} />}>
          <span className="shrink-0">
            {node.icon ? getIcon(node.icon) : <span className="h-4 w-4" />}
          </span>
          <span className="truncate">{label}</span>
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton isActive={isActive} disabled>
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const skeletonIds = useRef(
    Array.from({ length: 4 }, () => crypto.randomUUID()),
  );

  useEffect(() => {
    void fetchMenus().catch(() => undefined);
  }, [fetchMenus]);

  useEffect(() => {
    if (fetched) {
      const allIds = new Set<string>();
      function collect(nodes: SidebarTreeNode[]) {
        for (const node of nodes) {
          if (node.children.length > 0) {
            allIds.add(node.id);
            collect(node.children);
          }
        }
      }
      collect(treeMenus);
      setExpandedIds(allIds);
    }
  }, [fetched, treeMenus]);

  const handleToggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarMenu className="flex flex-col gap-1 py-2">
          {loading && !fetched ? (
            <SidebarMenuItem className="space-y-2 px-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={skeletonIds.current[i]} className="h-8 w-full" />
              ))}
            </SidebarMenuItem>
          ) : fetched && treeMenus.length === 0 ? (
            <SidebarMenuItem className="px-2 py-4 text-center text-muted-foreground text-sm">
              {t("noMenus")}
            </SidebarMenuItem>
          ) : (
            treeMenus.map((node) => (
              <SidebarMenuNode
                key={node.id}
                node={node}
                level={0}
                pathname={pathname}
                expandedIds={expandedIds}
                onToggle={handleToggle}
              />
            ))
          )}
        </SidebarMenu>
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
