"use client";

import { useStore } from "better-auth/react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  icons,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/api/auth-client";
import { useMenuStore } from "@/stores/menu-store";
import { cn } from "@/utils/cn";

const bottomMenuItems = [
  {
    key: "profile",
    url: "/profile",
    icon: UserIcon,
  },
];

import { UserIcon } from "lucide-react";

const iconsRecord = icons as Record<string, LucideIcon>;

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
  url?: string | null;
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
  const isActive = node.url ? pathname === node.url : false;

  const label = (() => {
    try {
      return t(node.code);
    } catch {
      return node.name;
    }
  })();

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
          {isExpanded && (
            <div className="ml-2">
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
            </div>
          )}
        </>
      ) : (
        <SidebarMenuButton
          isActive={isActive}
          render={<Link href={node.url ?? "#"} />}
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
  const session = useStore(authClient.useSession);
  const user = session?.data?.user;
  const t = useTranslations("Sidebar");
  const { treeMenus, loading, fetched, fetchMenus } = useMenuStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const skeletonIds = useRef(
    Array.from({ length: 4 }, () => crypto.randomUUID()),
  );

  useEffect(() => {
    fetchMenus();
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
          {loading && !fetched ? (
            <div className="space-y-2 px-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : fetched && treeMenus.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              {t("noMenus")}
            </div>
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
