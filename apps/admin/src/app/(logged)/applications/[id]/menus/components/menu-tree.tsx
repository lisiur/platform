'use client';

import { Folder, FolderOpen, LayoutDashboard, Settings, Shield, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { TreeView, type TreeNode } from '@/components/ui/tree-view';
import { appClient } from '@/lib/api';

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

function buildTree(menus: Menu[]): TreeNode[] {
  const map = new Map<string, TreeNode & { parentId?: string | null }>();
  const roots: TreeNode[] = [];

  for (const menu of menus) {
    map.set(menu.id, {
      id: menu.id,
      name: menu.name,
      icon: getIcon(menu.icon ?? null),
      children: [],
      parentId: menu.parentId,
    });
  }

  for (const menu of menus) {
    const node = map.get(menu.id)!;
    if (menu.parentId) {
      const parent = map.get(menu.parentId);
      if (parent) {
        parent.children = parent.children || [];
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
}

export function MenuTree({ appId, selectedMenuId, onSelectMenu }: MenuTreeProps) {
  const t = useTranslations('Menus');
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMenus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await appClient.api.menu.$get({ query: { appId } });
      if (res.ok) {
        const data = await res.json();
        setMenus(data.menus);
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

  const treeData = buildTree(menus);

  const handleSelect = useCallback(
    (node: TreeNode) => {
      const menu = menus.find((m) => m.id === node.id);
      if (menu) {
        onSelectMenu?.(menu);
      }
    },
    [menus, onSelectMenu],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <TreeView
      data={treeData}
      selectedId={selectedMenuId}
      onSelect={handleSelect}
      defaultExpandedIds={menus.filter((m) => !m.parentId).map((m) => m.id)}
    />
  );
}
