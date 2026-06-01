"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
      await withApiFeedback(appClient.api.menu[":id"].$put)({
        param: { id: selectedMenu.id },
        json: {
          name: data.name,
          code: data.code,
          icon: data.icon || null,
          linkType: data.linkType,
          url: data.url || null,
        },
      });
      handleMenuSaved();
    } catch {
      // Error handled by client
    } finally {
      setSaving(false);
    }
  }, [selectedMenu, handleMenuSaved]);

  return (
    <div className="flex min-h-0 flex-1 gap-6">
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
      <div className="min-w-0 flex-1 overflow-auto">
        {selectedMenu ? (
          <div className="space-y-6">
            <h3 className="text-lg font-medium">{t("editMenu")}</h3>
            <Separator />
            <MenuForm
              key={selectedMenu.id}
              ref={formRef}
              defaultValues={{
                name: selectedMenu.name,
                code: selectedMenu.code,
                icon: selectedMenu.icon ?? "",
                linkType: selectedMenu.linkType,
                url: selectedMenu.url ?? "",
              }}
            />
            <Separator />
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
