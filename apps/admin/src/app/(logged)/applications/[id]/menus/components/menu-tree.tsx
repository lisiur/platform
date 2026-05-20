"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Folder,
  FolderOpen,
  GripVertical,
  icons,
  Loader2,
  type LucideIcon,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { appClient } from "@/lib/api";
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

const iconsRecord = icons as Record<string, LucideIcon>;

function getIcon(icon: string | null): React.ReactNode | undefined {
  if (!icon) return undefined;
  const IconComponent = iconsRecord[icon];
  if (IconComponent) return <IconComponent className="h-4 w-4" />;
  return <Folder className="h-4 w-4" />;
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
  onAddChild: (menu: Menu) => void;
  onDelete: (menu: Menu) => void;
}

function SortableNode({
  node,
  level,
  selectedId,
  onSelect,
  expandedIds,
  onToggle,
  onAddChild,
  onDelete,
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
      <div
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
          isSelected && "bg-accent font-medium text-accent-foreground",
          isDragging && "opacity-50",
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        <span
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <button
          type="button"
          className="flex shrink-0 items-center"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.id);
            onSelect?.(node.menu);
          }}
        >
          {hasChildren ? (
            <>
              <FolderOpen
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  !isExpanded && "hidden",
                )}
              />
              <Folder
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  isExpanded && "hidden",
                )}
              />
            </>
          ) : (
            <span className="h-4 w-4" />
          )}
        </button>
        {node.icon && <span className="shrink-0">{node.icon}</span>}
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          onClick={() => onSelect?.(node.menu)}
        >
          {node.name}
        </button>
        <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(node.menu);
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.menu);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
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
              onAddChild={onAddChild}
              onDelete={onDelete}
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
  onMenuAdded?: () => void;
  onMenuDeleted?: () => void;
  refreshKey?: number;
}

export function MenuTree({
  appId,
  selectedMenuId,
  onSelectMenu,
  onMenuAdded,
  onMenuDeleted,
  refreshKey,
}: MenuTreeProps) {
  const t = useTranslations("Menus");
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [addChildTarget, setAddChildTarget] = useState<Menu | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [childName, setChildName] = useState("");
  const [childCode, setChildCode] = useState("");
  const [addingChild, setAddingChild] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Menu | null>(null);
  const [deleting, setDeleting] = useState(false);

  const menusRef = useRef<Menu[]>([]);

  const parentChangesRef = useRef<Map<string, string | null>>(new Map());

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
        setExpandedIds(
          new Set(
            data.menus.filter((m: Menu) => !m.parentId).map((m: Menu) => m.id),
          ),
        );
      }
    } catch {
      toast.error(t("fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [appId, t]);

  useEffect(() => {
    fetchMenus();
  }, [fetchMenus]);

  useEffect(() => {
    if (refreshKey) fetchMenus();
  }, [refreshKey, fetchMenus]);

  useEffect(() => {
    menusRef.current = menus;
  }, [menus]);

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

  const handleAddChild = useCallback((menu: Menu | null) => {
    setAddChildTarget(menu);
    setChildName("");
    setChildCode("");
    setShowAddDialog(true);
  }, []);

  const handleDelete = useCallback((menu: Menu) => {
    setDeleteTarget(menu);
  }, []);

  const handleAddChildSubmit = useCallback(async () => {
    if (!childName.trim() || !childCode.trim()) return;
    setAddingChild(true);
    try {
      await appClient.api.menu.$post({
        json: {
          name: childName.trim(),
          code: childCode.trim(),
          appId,
          parentId: addChildTarget?.id,
        },
      });
      toast.success(t("addChildSuccess"));
      setShowAddDialog(false);
      setAddChildTarget(null);
      setChildName("");
      setChildCode("");
      fetchMenus();
      onMenuAdded?.();
    } catch {
      // Error handled by client
    } finally {
      setAddingChild(false);
    }
  }, [addChildTarget, childName, childCode, appId, t, fetchMenus, onMenuAdded]);

  const handleDeleteSubmit = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await appClient.api.menu[":id"].$delete({
        param: { id: deleteTarget.id },
      });
      toast.success(t("deleteSuccess"));
      setDeleteTarget(null);
      fetchMenus();
      onMenuDeleted?.();
    } catch {
      // Error handled by client
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, t, fetchMenus, onMenuDeleted]);

  const findParentId = useCallback(
    (
      nodeId: string,
      nodes: SortableMenuItem[],
      parentId: string | null = null,
    ): string | null => {
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
    parentChangesRef.current.clear();
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      if (activeId === overId) return;

      const activeParentId = findParentId(activeId, treeData);
      const overParentId = findParentId(overId, treeData);

      if (activeParentId !== overParentId) {
        parentChangesRef.current.set(activeId, overParentId);
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

      if (!over || active.id === over.id) {
        parentChangesRef.current.clear();
        return;
      }

      const draggedId = String(active.id);
      const overId = String(over.id);

      const latestMenus = menusRef.current;

      const overParentId =
        latestMenus.find((m) => m.id === overId)?.parentId ?? null;

      const siblings = latestMenus.filter(
        (m) => (m.parentId ?? null) === overParentId,
      );

      const activeIndex = siblings.findIndex((m) => m.id === draggedId);
      const overIndex = siblings.findIndex((m) => m.id === overId);

      if (activeIndex === -1 || overIndex === -1) {
        parentChangesRef.current.clear();
        return;
      }

      const reordered = arrayMove(siblings, activeIndex, overIndex);

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

      // Build changed items using ref for parent changes + local sort order changes
      const changed: { id: string; parentId: string | null; sortOrder: number }[] = [];

      for (let i = 0; i < reordered.length; i++) {
        const item = reordered[i];
        const original = latestMenus.find((m) => m.id === item.id);
        if (!original) continue;

        const newParentId = parentChangesRef.current.has(item.id)
          ? parentChangesRef.current.get(item.id)!
          : (original.parentId ?? null);
        const newSortOrder = i;

        if (
          original.parentId !== newParentId ||
          original.sortOrder !== newSortOrder
        ) {
          changed.push({
            id: item.id,
            parentId: newParentId,
            sortOrder: newSortOrder,
          });
        }
      }

      // Also detect items whose parent changed but weren't in the reorder group
      for (const [itemId, newParentId] of parentChangesRef.current) {
        if (itemId === draggedId) continue;
        if (changed.some((c) => c.id === itemId)) continue;
        const original = latestMenus.find((m) => m.id === itemId);
        if (original && original.parentId !== newParentId) {
          changed.push({
            id: itemId,
            parentId: newParentId,
            sortOrder: original.sortOrder,
          });
        }
      }

      parentChangesRef.current.clear();

      if (changed.length === 0) return;

      try {
        const res = await appClient.api.menu.reorder.$post({
          json: { items: changed },
        });
        if (res.ok) {
          const data = await res.json();
          setMenus(data.menus);
        } else {
          toast.error(t("reorderFailed"));
          fetchMenus();
        }
      } catch {
        toast.error(t("reorderFailed"));
        fetchMenus();
      }
    },
    [menus, t, fetchMenus],
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
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="rounded-md border p-1">
          <div className="flex items-center gap-1 px-1 pb-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => handleAddChild(null as unknown as Menu)}
            >
              <Plus className="mr-1 h-3 w-3" />
              {t("createMenu")}
            </Button>
            <span className="text-muted-foreground">|</span>
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
          {treeData.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              {t("noData")}
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
                  onAddChild={handleAddChild}
                  onDelete={handleDelete}
                />
              ))}
            </SortableContext>
          )}
        </div>
        <DragOverlay>
          {activeMenu ? (
            <div className="flex items-center gap-1.5 rounded-md bg-background px-2 py-1.5 text-sm shadow-md opacity-90">
              {activeMenu.icon && (
                <span className="shrink-0">
                  {getIcon(activeMenu.icon ?? null)}
                </span>
              )}
              <span className="truncate">{activeMenu.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Add Child Dialog */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false);
            setAddChildTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {addChildTarget ? t("addChildTitle") : t("createMenu")}
            </DialogTitle>
            <DialogDescription>
              {addChildTarget
                ? t("addChildDescription")
                : t("createMenuDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field orientation="vertical">
              <FieldLabel htmlFor="child-name">{t("name")} *</FieldLabel>
              <FieldContent>
                <Input
                  id="child-name"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                />
              </FieldContent>
            </Field>
            <Field orientation="vertical">
              <FieldLabel htmlFor="child-code">{t("code")} *</FieldLabel>
              <FieldContent>
                <Input
                  id="child-code"
                  value={childCode}
                  onChange={(e) => setChildCode(e.target.value)}
                />
              </FieldContent>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddChildTarget(null)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={handleAddChildSubmit}
              disabled={addingChild || !childName.trim() || !childCode.trim()}
            >
              {addingChild && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirmDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSubmit}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
