"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { use, useCallback, useState } from "react";
import { MenuForm } from "./components/menu-form";
import { MenuTree } from "./components/menu-tree";

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

interface MenusPageProps {
  params: Promise<{ id: string }>;
}

export default function MenusPage({ params }: MenusPageProps) {
  const t = useTranslations("Menus");
  const { id } = use(params);
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 py-8">
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
      <div className="container mx-auto flex min-h-0 flex-1 gap-6">
        {/* Left panel — Tree navigation */}
        <div className="w-80 shrink-0 overflow-auto rounded-md border py-2">
          <MenuTree
            appId={id}
            selectedMenuId={selectedMenu?.id}
            onSelectMenu={handleSelectMenu}
            onMenuDeleted={handleMenuDeleted}
            refreshKey={refreshKey}
          />
        </div>
        {/* Right panel — Edit form */}
        <div className="flex-1 pb-8">
          {selectedMenu ? (
            <MenuForm menu={selectedMenu} onSaved={handleMenuSaved} />
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
