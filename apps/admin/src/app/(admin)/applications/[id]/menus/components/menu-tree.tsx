"use client";

import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import {
  Folder,
  GripVertical,
  icons,
  Link,
  Loader2,
  type LucideIcon,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
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
  DraggableTree,
  type DraggableTreeNode,
  type ReorderChange,
} from "@/components/ui/draggable-tree";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { MenuForm, type MenuFormRef, type MenuInput } from "./menu-form";

type LinkType = "GROUP" | "INTERNAL" | "EXTERNAL";

interface Menu {
  id: string;
  appId: string;
  parentId?: string | null;
  name: string;
  code: string;
  icon?: string | null;
  linkType: LinkType;
  url: string | null;
  sortOrder: number;
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
  const [dialogKey, setDialogKey] = useState(0);
  const [defaultLinkType, setDefaultLinkType] = useState<LinkType>("GROUP");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Menu | null>(null);
  const [deleting, setDeleting] = useState(false);

  const menusRef = useRef<Menu[]>([]);
  const createFormRef = useRef<MenuFormRef>(null);

  const fetchMenus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await withApiFeedback(appClient.api.menus.$get)({
        query: { appId },
      });
      const data = await res.json();
      setMenus(data.menus);
      menusRef.current = data.menus;
    } catch {
      setMenus([]);
      menusRef.current = [];
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    fetchMenus();
  }, [fetchMenus]);

  useEffect(() => {
    if (refreshKey) fetchMenus();
  }, [refreshKey, fetchMenus]);

  const treeData = useMemo(() => buildTree(menus), [menus]);

  const handleSelect = useCallback(
    (node: MenuTreeNode) => {
      onSelectMenu?.(node.menu);
    },
    [onSelectMenu],
  );

  const handleAddChild = useCallback(
    (menu: Menu | null, linkType: LinkType = "GROUP") => {
      setAddChildTarget(menu);
      setDefaultLinkType(linkType);
      setDialogKey((k) => k + 1);
      setShowAddDialog(true);
    },
    [],
  );

  const handleDelete = useCallback((menu: Menu) => {
    setDeleteTarget(menu);
  }, []);

  const handleAddChildSubmit = useCallback(async () => {
    if (!createFormRef.current) return;
    let data: MenuInput;
    try {
      data = await createFormRef.current.validate();
    } catch {
      return;
    }
    setSaving(true);
    try {
      await withApiFeedback(appClient.api.menus.$post)({
        json: {
          name: data.name,
          code: data.code,
          appId,
          parentId: addChildTarget?.id,
          icon: data.icon,
          linkType: data.linkType,
          url: data.url,
        },
      });
      toast.success(addChildTarget ? t("addChildSuccess") : t("createSuccess"));
      setShowAddDialog(false);
      setAddChildTarget(null);
      fetchMenus();
      onMenuAdded?.();
    } catch {
      // Error handled by client
    } finally {
      setSaving(false);
    }
  }, [addChildTarget, appId, t, fetchMenus, onMenuAdded]);

  const handleDeleteSubmit = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await withApiFeedback(appClient.api.menus[":id"].$delete)({
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
            return {
              ...m,
              parentId: change.parentId,
              sortOrder: change.sortOrder,
            };
          }
          return m;
        });
        menusRef.current = updated;
        return updated;
      });

      try {
        const res = await withApiFeedback(appClient.api.menus.reorder.$post)({
          json: { items: changed },
        });
        const data = await res.json();
        setMenus(data.menus);
        menusRef.current = data.menus;
      } catch {
        fetchMenus();
      }
    },
    [fetchMenus],
  );

  const renderNode = useCallback(
    (
      node: MenuTreeNode,
      props: {
        isDragging: boolean;
        isSelected: boolean;
        isExpanded: boolean;
        hasChildren: boolean;
        canExpand: boolean;
        level: number;
        attributes: DraggableAttributes;
        listeners: DraggableSyntheticListeners | undefined;
        expandToggle: ReactNode;
      },
    ) => {
      return (
        <div
          className={`group flex w-full items-center gap-1.5 pr-2 rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
            props.isSelected
              ? "bg-accent font-medium text-accent-foreground"
              : ""
          } ${props.isDragging ? "opacity-50" : ""}`}
          style={{ paddingLeft: `${props.level * 16 + 8}px` }}
        >
          <button
            type="button"
            className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground"
            {...props.attributes}
            {...props.listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 truncate text-left"
            onClick={() => {
              handleSelect(node);
            }}
          >
            {node.icon && <span className="shrink-0">{node.icon}</span>}
            <span className="truncate">{node.name}</span>
          </button>
          <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {node.menu.linkType === "GROUP" && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon" className="h-5 w-5" />
                  }
                >
                  <Plus className="h-3 w-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-fit">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddChild(node.menu, "INTERNAL");
                    }}
                  >
                    <Link className="h-4 w-4" />
                    {t("createSubMenu")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddChild(node.menu, "GROUP");
                    }}
                  >
                    <Folder className="h-4 w-4" />
                    {t("createSubGroup")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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
          {props.expandToggle}
        </div>
      );
    },
    [handleSelect, handleAddChild, handleDelete, t],
  );

  if (loading && menus.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <DraggableTree
        className="flex flex-col gap-2"
        data={treeData}
        selectedId={selectedMenuId}
        onReorder={handleReorder}
        isExpandable={(node) => node.menu.linkType === "GROUP"}
        defaultExpandedIds={[]}
        expandAllLabel={t("expandAll")}
        collapseAllLabel={t("collapseAll")}
        emptyLabel={t("noData")}
        renderNode={renderNode}
        toolbar={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-6 w-6"
                  aria-label={t("createMenu")}
                />
              }
            >
              <Plus className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-fit">
              <DropdownMenuItem
                onClick={() => handleAddChild(null, "INTERNAL")}
              >
                <Link className="h-4 w-4" />
                {t("createMenu")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddChild(null, "GROUP")}>
                <Folder className="h-4 w-4" />
                {t("createGroup")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
          <MenuForm
            key={dialogKey}
            ref={createFormRef}
            defaultValues={{
              name: "",
              code: "",
              icon: "",
              linkType: defaultLinkType,
              url: "",
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                setAddChildTarget(null);
              }}
            >
              {t("cancel")}
            </Button>
            <Button onClick={handleAddChildSubmit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
