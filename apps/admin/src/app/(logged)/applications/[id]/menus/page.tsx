"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { use, useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { appClient } from "@/lib/api";
import type { LinkType } from "@/lib/api/menu";
import {
  MenuForm,
  type MenuFormRef,
  type MenuInput,
} from "./components/menu-form";
import { MenuTree } from "./components/menu-tree";

interface Menu {
  id: string;
  appId: string;
  parentId?: string | null;
  name: string;
  code: string;
  icon?: string | null;
  linkType: LinkType;
  url?: string | null;
  sortOrder: number;
}

interface MenusPageProps {
  params: Promise<{ id: string }>;
}

export default function MenusPage({ params }: MenusPageProps) {
  const t = useTranslations("Menus");
  const { id } = use(params);
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<MenuFormRef>(null);

  const handleSelectMenu = useCallback((menu: Menu) => {
    setSelectedMenu(menu);
  }, []);

  const handleMenuSaved = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleMenuDeleted = useCallback(() => {
    setSelectedMenu(null);
    setRefreshKey((k) => k + 1);
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
      await appClient.api.menu[":id"].$put({
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
    <div className="flex h-full flex-col py-8 gap-4">
      <div className="shrink-0">
        <div className="container mx-auto">
          <Link
            href="/applications"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backToApps")}
          </Link>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
      </div>
      <div className="container mx-auto flex flex-1 gap-6">
        <div className="w-80 h-full overflow-auto rounded-md border p-2">
          <MenuTree
            appId={id}
            selectedMenuId={selectedMenu?.id}
            onSelectMenu={handleSelectMenu}
            onMenuAdded={handleMenuSaved}
            onMenuDeleted={handleMenuDeleted}
            refreshKey={refreshKey}
          />
        </div>
        <div className="flex-1 pb-8">
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
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {t("selectMenuToEdit")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
