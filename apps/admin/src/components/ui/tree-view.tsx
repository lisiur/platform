"use client";

import { ChevronRight } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/utils/cn";

export interface TreeNode {
  id: string;
  name: string;
  icon?: React.ReactNode;
  children?: TreeNode[];
  [key: string]: unknown;
}

interface TreeViewProps {
  data: TreeNode[];
  selectedId?: string | null;
  onSelect?: (node: TreeNode) => void;
  className?: string;
  defaultExpandedIds?: string[];
}

interface TreeNodeItemProps {
  node: TreeNode;
  level: number;
  selectedId?: string | null;
  onSelect?: (node: TreeNode) => void;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}

function TreeNodeItem({
  node,
  level,
  selectedId,
  onSelect,
  expandedIds,
  onToggle,
}: TreeNodeItemProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
          isSelected && "bg-accent font-medium text-accent-foreground",
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => {
          if (hasChildren) {
            onToggle(node.id);
          }
          onSelect?.(node);
        }}
      >
        {hasChildren ? (
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              isExpanded && "rotate-90",
            )}
          />
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        {node.icon && <span className="shrink-0">{node.icon}</span>}
        <span className="truncate">{node.name}</span>
      </button>
      {hasChildren && isExpanded && (
        <div>
          {node.children?.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeView({
  data,
  selectedId,
  onSelect,
  className,
  defaultExpandedIds = [],
}: TreeViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(defaultExpandedIds),
  );

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

  const expandAll = useCallback(() => {
    const allIds = new Set<string>();
    function collect(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          allIds.add(node.id);
          collect(node.children);
        }
      }
    }
    collect(data);
    setExpandedIds(allIds);
  }, [data]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  return (
    <div className={cn("rounded-md border p-1", className)}>
      <div className="flex gap-1 px-1 pb-1">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={expandAll}
        >
          展开全部
        </button>
        <span className="text-muted-foreground">/</span>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={collapseAll}
        >
          收起全部
        </button>
      </div>
      {data.length === 0 ? (
        <div className="py-4 text-center text-sm text-muted-foreground">
          暂无数据
        </div>
      ) : (
        data.map((node) => (
          <TreeNodeItem
            key={node.id}
            node={node}
            level={0}
            selectedId={selectedId}
            onSelect={onSelect}
            expandedIds={expandedIds}
            onToggle={handleToggle}
          />
        ))
      )}
    </div>
  );
}
