'use client';

import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Folder, FolderOpen, GripVertical, LayoutDashboard, Settings, Shield, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { appClient } from '@/lib/api';
import { cn } from '@/utils/cn';

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

const ICON_MAP: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard className="h-4 w-4" />,
  settings: <Settings className="h-4 w-4" />,
  users: <Users className="h-4 w-4" />,
  shield: <Shield className="h-4 w-4" />,
  folder: <Folder className="h-4 w-4" />,
  'folder-open': <FolderOpen className="h-4 w-4" />,
};

function getIcon(icon: string | null): React.ReactNode | undefined {
  if (!icon) return undefined;
  return ICON_MAP[icon] || <Folder className="h-4 w-4" />;
}

function buildTree(menus: Menu[]): SortableMenuItem[] {
  const map = new Map<string, SortableMenuItem>();
  const roots: SortableMenuItem[] = [];

  for (const menu of menus) {
    map.set(menu.id, {
      id: menu.id,
      name: menu.name,
      icon: getIcon(menu.icon ?? null),
      children: [],
      parentId: menu.parentId ?? null,
      sortOrder: menu.sortOrder,
      menu,
    });
  }

  for (const menu of menus) {
    const node = map.get(menu.id)!;
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

  // Sort children by sortOrder
  function sortChildren(nodes: SortableMenuItem[]) {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const node of nodes) {
      sortChildren(node.children);
    }
  }
  sortChildren(roots);

  return roots;
}

interface SortableMenuItem {
  id: string;
  name: string;
  icon?: React.ReactNode;
  children: SortableMenuItem[];
  parentId: string | null;
  sortOrder: number;
  menu: Menu;
}

interface SortableNodeProps {
  node: SortableMenuItem;
  level: number;
  selectedId?: string | null;
  onSelect?: (menu: Menu) => void;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}

function SortableNode({
  node,
  level,
  selectedId,
  onSelect,
  expandedIds,
  onToggle,
}: SortableNodeProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <div ref={setNodeRef} style={style}>
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
          isSelected && 'bg-accent font-medium text-accent-foreground',
          isDragging && 'opacity-50',
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => {
          if (hasChildren) {
            onToggle(node.id);
          }
          onSelect?.(node.menu);
        }}
      >
        <span
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </span>
        {hasChildren ? (
          <span
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            <FolderOpen
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                !isExpanded && 'hidden',
              )}
            />
            <Folder
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                isExpanded && 'hidden',
              )}
            />
          </span>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        {node.icon && <span className="shrink-0">{node.icon}</span>}
        <span className="truncate">{node.name}</span>
      </button>
      {hasChildren && isExpanded && (
        <SortableContext
          items={node.children.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {node.children.map((child) => (
            <SortableNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
}

interface MenuTreeProps {
  appId: string;
  selectedMenuId?: string | null;
  onSelectMenu?: (menu: Menu) => void;
}

export function MenuTree({ appId, selectedMenuId, onSelectMenu }: MenuTreeProps) {
  const t = useTranslations('Menus');
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const fetchMenus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await appClient.api.menu.$get({ query: { appId } });
      if (res.ok) {
        const data = await res.json();
        setMenus(data.menus);
        // Auto-expand root nodes
        setExpandedIds(
          new Set(data.menus.filter((m: Menu) => !m.parentId).map((m: Menu) => m.id)),
        );
      }
    } catch {
      toast.error(t('fetchFailed'));
    } finally {
      setLoading(false);
    }
  }, [appId, t]);

  useEffect(() => {
    fetchMenus();
  }, [fetchMenus]);

  const treeData = useMemo(() => buildTree(menus), [menus]);

  const handleSelect = useCallback(
    (menu: Menu) => {
      onSelectMenu?.(menu);
    },
    [onSelectMenu],
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

  const findParentId = useCallback(
    (nodeId: string, nodes: SortableMenuItem[], parentId: string | null = null): string | null => {
      for (const node of nodes) {
        if (node.id === nodeId) return parentId;
        const found = findParentId(nodeId, node.children, node.id);
        if (found !== null) return found;
      }
      return null;
    },
    [],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      if (activeId === overId) return;

      // Check if we're dragging onto a different parent
      const activeParentId = findParentId(activeId, treeData);
      const overParentId = findParentId(overId, treeData);

      // If dragging to a different parent level, move the node
      if (activeParentId !== overParentId) {
        setMenus((prev) => {
          const updated = [...prev];
          const activeMenu = updated.find((m) => m.id === activeId);
          if (activeMenu) {
            activeMenu.parentId = overParentId;
          }
          return updated;
        });
      }
    },
    [treeData, findParentId],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over || active.id === over.id) return;

      const draggedId = String(active.id);
      const overId = String(over.id);

      // Use functional form to get the latest menus state (handleDragOver may have updated it)
      let latestMenus: Menu[] = [];
      setMenus((prev) => {
        latestMenus = prev;
        return prev; // Don't modify yet
      });

      // Find the parent of the over item from latest state
      const overParentId = latestMenus.find((m) => m.id === overId)?.parentId ?? null;

      // Get all siblings under the same parent
      const siblings = latestMenus.filter(
        (m) => (m.parentId ?? null) === overParentId,
      );

      // Find current and target indices
      const activeIndex = siblings.findIndex((m) => m.id === draggedId);
      const overIndex = siblings.findIndex((m) => m.id === overId);

      if (activeIndex === -1 || overIndex === -1) return;

      // Reorder locally
      const reordered = arrayMove(siblings, activeIndex, overIndex);

      // Update menus state with new sort orders
      setMenus((prev) => {
        const updated = [...prev];
        for (let i = 0; i < reordered.length; i++) {
          const menu = updated.find((m) => m.id === reordered[i].id);
          if (menu) {
            menu.sortOrder = i;
          }
        }
        return updated;
      });

      // Build reorder payload with all items that changed
      const changed = reordered
        .map((item, idx) => {
          const original = latestMenus.find((m) => m.id === item.id);
          if (!original) return null;
          const newParentId = original.parentId ?? null;
          const newSortOrder = idx;
          if (original.parentId !== newParentId || original.sortOrder !== newSortOrder) {
            return { id: item.id, parentId: newParentId, sortOrder: newSortOrder };
          }
          return null;
        })
        .filter(Boolean) as { id: string; parentId: string | null; sortOrder: number }[];

      // Also include items that changed parentId but weren't in the reorder group
      for (const item of latestMenus) {
        if (item.id === draggedId) continue;
        const inChanged = changed.some((c) => c.id === item.id);
        if (!inChanged) {
          const original = latestMenus.find((m) => m.id === item.id);
          if (original && original.parentId !== item.parentId) {
            changed.push({
              id: item.id,
              parentId: item.parentId ?? null,
              sortOrder: item.sortOrder,
            });
          }
        }
      }

      if (changed.length === 0) return;

      try {
        const res = await appClient.api.menu.reorder.$post({
          json: { items: changed },
        });
        if (res.ok) {
          const data = await res.json();
          setMenus(data.menus);
        } else {
          toast.error(t('reorderFailed'));
          fetchMenus();
        }
      } catch {
        toast.error(t('reorderFailed'));
        fetchMenus();
      }
    },
    [t, fetchMenus],
  );

  const activeMenu = activeId ? menus.find((m) => m.id === activeId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="rounded-md border p-1">
        <div className="flex gap-1 px-1 pb-1">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              const allIds = new Set<string>();
              function collect(nodes: SortableMenuItem[]) {
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
            展开全部
          </button>
          <span className="text-muted-foreground">/</span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setExpandedIds(new Set())}
          >
            收起全部
          </button>
        </div>
        {treeData.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            暂无数据
          </div>
        ) : (
          <SortableContext
            items={treeData.map((n) => n.id)}
            strategy={verticalListSortingStrategy}
          >
            {treeData.map((node) => (
              <SortableNode
                key={node.id}
                node={node}
                level={0}
                selectedId={selectedMenuId}
                onSelect={handleSelect}
                expandedIds={expandedIds}
                onToggle={handleToggle}
              />
            ))}
          </SortableContext>
        )}
      </div>
      <DragOverlay>
        {activeMenu ? (
          <div className="flex items-center gap-1.5 rounded-md bg-background px-2 py-1.5 text-sm shadow-md opacity-90">
            {activeMenu.icon && <span className="shrink-0">{getIcon(activeMenu.icon ?? null)}</span>}
            <span className="truncate">{activeMenu.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
