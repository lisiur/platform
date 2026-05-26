"use client";

import { useStore } from "better-auth/react";
import {
  ChevronRight,
  ChevronsUpDown,
  Folder,
  FolderOpen,
  icons,
  LogOut,
  type LucideIcon,
  UserIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  linkType: "GROUP" | "INTERNAL" | "EXTERNAL";
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
  const href =
    node.linkType === "INTERNAL"
      ? `/${node.code}`
      : node.linkType === "EXTERNAL"
        ? node.url
        : undefined;
  const isActive = href ? pathname === href : false;

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
      ) : node.linkType === "EXTERNAL" ? (
        <SidebarMenuButton
          isActive={isActive}
          render={
            // biome-ignore lint/a11y/useAnchorContent: SidebarMenuButton renders children inside the anchor
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
  const router = useRouter();
  const session = useStore(authClient.useSession);
  const user = session?.data?.user;
  const t = useTranslations("Sidebar");
  const { treeMenus, loading, fetched, fetchMenus } = useMenuStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const skeletonIds = useRef(
    Array.from({ length: 4 }, () => crypto.randomUUID()),
  );

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/sign-in");
  };

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
        <SidebarMenu className="flex flex-col gap-1 py-2">
          {loading && !fetched ? (
            <div className="space-y-2 px-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={skeletonIds.current[i]} className="h-8 w-full" />
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
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="w-full data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
                  />
                }
              >
                <div className="relative flex aspect-square h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  {user?.image ? (
                    <Image
                      src={user.image}
                      alt={user.name ?? ""}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="text-xs font-semibold">{initials}</span>
                  )}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user?.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user?.email}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                side="top"
                align="start"
                sideOffset={4}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium leading-none">
                        {user?.name}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/profile" />}>
                  <UserIcon />
                  {t("profile")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                  <LogOut />
                  {t("signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
