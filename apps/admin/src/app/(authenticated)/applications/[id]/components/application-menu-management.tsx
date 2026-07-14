"use client";

import {
  Button,
  Separator,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from "@repo/ui";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import {
  MenuForm,
  type MenuFormRef,
  type MenuInput,
} from "../menus/components/menu-form";
import { MenuTree } from "../menus/components/menu-tree";

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
  permissions: { id: string; code: string; name: string; group: string }[];
}

interface ApplicationMenuManagementProps {
  appId: string;
}

export function ApplicationMenuManagement({
  appId,
}: ApplicationMenuManagementProps) {
  const t = useTranslations("Menus");
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<MenuFormRef>(null);
  const isMobile = useIsMobile();

  const handleSelectMenu = useCallback((menu: Menu) => {
    setSelectedMenu(menu);
  }, []);

  const handleMenuSaved = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  const handleMenuDeleted = useCallback(() => {
    setSelectedMenu(null);
    setRefreshKey((key) => key + 1);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formRef.current || !selectedMenu) return;

    let data: MenuInput;
    try {
      data = await formRef.current.validate();
    } catch {
      return;
    }

    setSaving(true);
    try {
      await withApiFeedback(appClient.api.menus[":id"].$put)({
        param: { id: selectedMenu.id },
        json: {
          name: data.name,
          code: data.code,
          icon: data.icon || null,
          linkType: data.linkType,
          url: data.url || null,
          permissionIds: data.permissionIds,
        },
      });
      handleMenuSaved();
      if (isMobile) {
        setSelectedMenu(null);
      }
    } catch {
      // Error handled by client
    } finally {
      setSaving(false);
    }
  }, [selectedMenu, handleMenuSaved, isMobile]);

  const editContent = selectedMenu ? (
    <MenuForm
      key={selectedMenu.id}
      ref={formRef}
      appId={appId}
      selectedItems={selectedMenu.permissions}
      defaultValues={{
        name: selectedMenu.name,
        code: selectedMenu.code,
        icon: selectedMenu.icon ?? "",
        linkType: selectedMenu.linkType,
        url: selectedMenu.url ?? "",
        permissionIds: selectedMenu.permissions.map((p) => p.id),
      }}
    />
  ) : null;

  if (isMobile) {
    return (
      <>
        <div className="h-full w-full overflow-auto rounded-md border p-2">
          <MenuTree
            appId={appId}
            selectedMenuId={selectedMenu?.id}
            onSelectMenu={handleSelectMenu}
            onMenuAdded={handleMenuSaved}
            onMenuDeleted={handleMenuDeleted}
            refreshKey={refreshKey}
          />
        </div>
        <Sheet
          open={!!selectedMenu}
          onOpenChange={(open) => !open && setSelectedMenu(null)}
        >
          <SheetContent side="bottom" className="max-h-[90dvh]">
            <SheetHeader>
              <SheetTitle>{selectedMenu?.name}</SheetTitle>
              <SheetDescription>{t("editMenu")}</SheetDescription>
            </SheetHeader>
            <SheetBody>{editContent}</SheetBody>
            <SheetFooter>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("save")}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden gap-6">
      <div className="h-full w-80 overflow-auto rounded-md border p-2">
        <MenuTree
          appId={appId}
          selectedMenuId={selectedMenu?.id}
          onSelectMenu={handleSelectMenu}
          onMenuAdded={handleMenuSaved}
          onMenuDeleted={handleMenuDeleted}
          refreshKey={refreshKey}
        />
      </div>
      <div className="min-w-0 flex-1 h-full overflow-hidden">
        {selectedMenu ? (
          <div className="space-y-6 h-full flex flex-col">
            <h3 className="text-lg font-medium">{t("editMenu")}</h3>
            <Separator />
            <div className="flex-1 overflow-auto">{editContent}</div>
            <Separator />
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        ) : (
          <div className="flex h-full min-h-64 items-center justify-center rounded-md border border-dashed text-muted-foreground">
            {t("selectMenuToEdit")}
          </div>
        )}
      </div>
    </div>
  );
}
