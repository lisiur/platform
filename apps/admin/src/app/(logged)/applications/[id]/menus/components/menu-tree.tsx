"use client";

import {
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import {
  Folder,
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
import {
  type DraggableTreeNode,
  DraggableTree,
  type ReorderChange,
} from "@/components/ui/draggable-tree";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { appClient } from "@/lib/api";

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

interface MenuTreeNode extends DraggableTreeNode {
  menu: Menu;
}

const iconsRecord = icons as Record<string, LucideIcon>;

function getIcon(icon: string | null): React.ReactNode | undefined {
  if (!icon) return undefined;
  const IconComponent = iconsRecord[icon];
  if (IconComponent) return <IconComponent className="h-4 w-4" />;
  return <Folder className="h-4 w-4" />;
}

function buildTree(menus: Menu[]): MenuTreeNode[] {
  const map = new Map<string, MenuTreeNode>();
  const roots: MenuTreeNode[] = [];

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

  return roots;
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

  const [addChildTarget, setAddChildTarget] = useState<Menu | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [childName, setChildName] = useState("");
  const [childCode, setChildCode] = useState("");
  const [addingChild, setAddingChild] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Menu | null>(null);
  const [deleting, setDeleting] = useState(false);

  const menusRef = useRef<Menu[]>([]);

  const fetchMenus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await appClient.api.menu.$get({ query: { appId } });
      if (res.ok) {
        const data = await res.json();
        setMenus(data.menus);
        menusRef.current = data.menus;
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

  const treeData = useMemo(() => buildTree(menus), [menus]);

  const defaultExpandedIds = useMemo(
    () => menus.filter((m) => !m.parentId).map((m) => m.id),
    [menus],
  );

  const handleSelect = useCallback(
    (node: MenuTreeNode) => {
      onSelectMenu?.(node.menu);
    },
    [onSelectMenu],
  );

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

  const handleReorder = useCallback(
    async (changed: ReorderChange[]) => {
      setMenus((prev) => {
        const updated = prev.map((m) => {
          const change = changed.find((c) => c.id === m.id);
          if (change) {
            return { ...m, parentId: change.parentId, sortOrder: change.sortOrder };
          }
          return m;
        });
        menusRef.current = updated;
        return updated;
      });

      try {
        const res = await appClient.api.menu.reorder.$post({
          json: { items: changed },
        });
        if (res.ok) {
          const data = await res.json();
          setMenus(data.menus);
          menusRef.current = data.menus;
        } else {
          toast.error(t("reorderFailed"));
          fetchMenus();
        }
      } catch {
        toast.error(t("reorderFailed"));
        fetchMenus();
      }
    },
    [t, fetchMenus],
  );

  const renderNode = useCallback(
    (
      node: MenuTreeNode,
      props: {
        isDragging: boolean;
        isSelected: boolean;
        isExpanded: boolean;
        hasChildren: boolean;
        level: number;
        attributes: DraggableAttributes;
        listeners: DraggableSyntheticListeners;
      },
    ) => {
      return (
        <div
          className={`group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
            props.isSelected
              ? "bg-accent font-medium text-accent-foreground"
              : ""
          } ${props.isDragging ? "opacity-50" : ""}`}
          style={{ paddingLeft: `${props.level * 16 + 8}px` }}
        >
          <span
            className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground"
            {...props.attributes}
            {...props.listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </span>
          {node.icon && <span className="shrink-0">{node.icon}</span>}
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left"
            onClick={() => handleSelect(node)}
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
                handleAddChild(node.menu);
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
                handleDelete(node.menu);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      );
    },
    [handleSelect, handleAddChild, handleDelete],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <DraggableTree
        data={treeData}
        selectedId={selectedMenuId}
        onSelect={handleSelect}
        onReorder={handleReorder}
        defaultExpandedIds={defaultExpandedIds}
        expandAllLabel={t("expandAll")}
        collapseAllLabel={t("collapseAll")}
        emptyLabel={t("noData")}
        renderNode={renderNode}
        toolbar={
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 text-xs"
            onClick={() => handleAddChild(null as unknown as Menu)}
          >
            <Plus className="mr-1 h-3 w-3" />
            {t("createMenu")}
          </Button>
        }
      />

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
