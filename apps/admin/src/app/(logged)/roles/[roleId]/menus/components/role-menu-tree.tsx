"use client";

import {
  ChevronRight,
  Folder,
  FolderOpen,
  icons,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils/cn";

interface Menu {
  id: string;
  appId: string;
  parentId?: string | null;
  name: string;
  code: string;
  icon?: string | null;
  url?: string | null;
  sortOrder: number;
  isExternal: boolean;
  isVisible: boolean;
}

interface TreeNode {
  id: string;
  name: string;
  icon?: string | null;
  children: TreeNode[];
}

const iconsRecord = icons as Record<string, LucideIcon>;

function getIcon(icon: string | null): React.ReactNode | undefined {
  if (!icon) return undefined;
  const IconComponent = iconsRecord[icon];
  if (IconComponent) return <IconComponent className="h-4 w-4" />;
  return <Folder className="h-4 w-4" />;
}

function buildTree(menus: Menu[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const menu of menus) {
    map.set(menu.id, {
      id: menu.id,
      name: menu.name,
      icon: menu.icon,
      children: [],
    });
  }

  for (const menu of menus) {
    const node = map.get(menu.id);
    if (!node) continue;
    if (menu.parentId) {
      const parent = map.get(menu.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  function sortChildren(nodes: TreeNode[]) {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) {
      sortChildren(node.children);
    }
  }
  sortChildren(roots);

  return roots;
}

function collectAllDescendantIds(node: TreeNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.id);
    ids.push(...collectAllDescendantIds(child));
  }
  return ids;
}

interface RoleMenuTreeProps {
  menus: Menu[];
  checkedIds: Set<string>;
  onCheckedChange: (checkedIds: Set<string>) => void;
}

export function RoleMenuTree({
  menus,
  checkedIds,
  onCheckedChange,
}: RoleMenuTreeProps) {
  const t = useTranslations("RoleMenus");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const allIds = new Set<string>();
    for (const menu of menus) {
      if (!menu.parentId) {
        allIds.add(menu.id);
      }
    }
    return allIds;
  });

  const treeData = useMemo(() => buildTree(menus), [menus]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleCheckedChange = useCallback(
    (node: TreeNode, checked: boolean) => {
      const newChecked = new Set(checkedIds);
      const descendantIds = collectAllDescendantIds(node);

      if (checked) {
        newChecked.add(node.id);
        for (const id of descendantIds) {
          newChecked.add(id);
        }
      } else {
        newChecked.delete(node.id);
        for (const id of descendantIds) {
          newChecked.delete(id);
        }
      }

      onCheckedChange(newChecked);
    },
    [checkedIds, onCheckedChange],
  );

  if (menus.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        {t("noMenus")}
      </div>
    );
  }

  return (
    <div className="rounded-md border p-1">
      <div className="flex gap-1 px-1 pb-1">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            const allIds = new Set<string>();
            function collect(nodes: TreeNode[]) {
              for (const node of nodes) {
                if (node.children.length > 0) {
                  allIds.add(node.id);
                  collect(node.children);
                }
              }
            }
            collect(treeData);
            setExpandedIds(allIds);
          }}
        >
          {t("expandAll")}
        </button>
        <span className="text-muted-foreground">/</span>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpandedIds(new Set())}
        >
          {t("collapseAll")}
        </button>
      </div>
      {treeData.map((node) => (
        <TreeNodeComponent
          key={node.id}
          node={node}
          level={0}
          checkedIds={checkedIds}
          expandedIds={expandedIds}
          onToggle={handleToggle}
          onCheckedChange={handleCheckedChange}
        />
      ))}
    </div>
  );
}

interface TreeNodeComponentProps {
  node: TreeNode;
  level: number;
  checkedIds: Set<string>;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onCheckedChange: (node: TreeNode, checked: boolean) => void;
}

function TreeNodeComponent({
  node,
  level,
  checkedIds,
  expandedIds,
  onToggle,
  onCheckedChange,
}: TreeNodeComponentProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isChecked = checkedIds.has(node.id);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        <Checkbox
          checked={isChecked}
          onCheckedChange={(checked) => onCheckedChange(node, !!checked)}
        />
        {hasChildren ? (
          <button
            type="button"
            className="shrink-0"
            onClick={() => onToggle(node.id)}
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isExpanded && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        {node.icon ? (
          <span className="shrink-0">{getIcon(node.icon)}</span>
        ) : hasChildren ? (
          <span className="shrink-0 text-muted-foreground">
            {isExpanded ? (
              <FolderOpen className="h-4 w-4" />
            ) : (
              <Folder className="h-4 w-4" />
            )}
          </span>
        ) : null}
        <span className="truncate">{node.name}</span>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              level={level + 1}
              checkedIds={checkedIds}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onCheckedChange={onCheckedChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
