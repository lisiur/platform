"use client";

import {
  ChevronRight,
  Folder,
  icons,
  Link,
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
  linkType: "GROUP" | "INTERNAL" | "EXTERNAL";
  url?: string | null;
  sortOrder: number;
}

interface TreeNode {
  id: string;
  name: string;
  icon?: string | null;
  linkType: "GROUP" | "INTERNAL" | "EXTERNAL";
  sortOrder: number;
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
      linkType: menu.linkType,
      sortOrder: menu.sortOrder,
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
    nodes.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
    for (const node of nodes) {
      sortChildren(node.children);
    }
  }
  sortChildren(roots);

  return roots;
}

function isSelectableNode(node: TreeNode) {
  return node.linkType !== "GROUP" || node.children.length === 0;
}

function collectSelectableIds(node: TreeNode): string[] {
  const ids: string[] = [];

  if (isSelectableNode(node)) {
    ids.push(node.id);
  }

  for (const child of node.children) {
    ids.push(...collectSelectableIds(child));
  }

  return ids;
}

interface CheckState {
  checked: boolean;
  indeterminate: boolean;
}

function getCheckState(node: TreeNode, selectedIds: Set<string>): CheckState {
  if (node.children.length === 0) {
    return {
      checked: selectedIds.has(node.id),
      indeterminate: false,
    };
  }

  const childStates = node.children.map((child) =>
    getCheckState(child, selectedIds),
  );
  const allChildrenChecked = childStates.every((state) => state.checked);
  const hasCheckedChild = childStates.some(
    (state) => state.checked || state.indeterminate,
  );

  return {
    checked: allChildrenChecked,
    indeterminate: !allChildrenChecked && hasCheckedChild,
  };
}

interface RoleMenuTreeProps {
  menus: Menu[];
  selectedIds: Set<string>;
  onSelectedChange: (selectedIds: Set<string>) => void;
}

export function RoleMenuTree({
  menus,
  selectedIds,
  onSelectedChange,
}: RoleMenuTreeProps) {
  const t = useTranslations("RoleMenus");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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
      const newSelected = new Set(selectedIds);
      const selectableIds = collectSelectableIds(node);

      if (checked) {
        for (const id of selectableIds) {
          newSelected.add(id);
        }
      } else {
        for (const id of selectableIds) {
          newSelected.delete(id);
        }
      }

      onSelectedChange(newSelected);
    },
    [selectedIds, onSelectedChange],
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
          selectedIds={selectedIds}
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
  selectedIds: Set<string>;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onCheckedChange: (node: TreeNode, checked: boolean) => void;
}

function TreeNodeComponent({
  node,
  level,
  selectedIds,
  expandedIds,
  onToggle,
  onCheckedChange,
}: TreeNodeComponentProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const { checked: isChecked, indeterminate: isIndeterminate } = getCheckState(
    node,
    selectedIds,
  );

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        <Checkbox
          checked={isChecked}
          indeterminate={isIndeterminate}
          onCheckedChange={(checked) => onCheckedChange(node, !!checked)}
        />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left text-sm text-inherit disabled:cursor-default"
          onClick={() => {
            if (hasChildren) onToggle(node.id);
          }}
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-label={
            hasChildren
              ? `${isExpanded ? "Collapse" : "Expand"} ${node.name}`
              : node.name
          }
          disabled={!hasChildren}
        >
          {node.icon ? (
            <span className="shrink-0">{getIcon(node.icon)}</span>
          ) : (
            <span>
              {hasChildren ? (
                <Link className="h-4 w-4" />
              ) : (
                <Folder className="h-4 w-4" />
              )}
            </span>
          )}
          <span className="truncate">{node.name}</span>
          {hasChildren ? (
            <ChevronRight
              className={cn(
                "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                isExpanded && "rotate-90",
              )}
            />
          ) : (
            <span className="ml-auto h-4 w-4 shrink-0" />
          )}
        </button>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              level={level + 1}
              selectedIds={selectedIds}
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
