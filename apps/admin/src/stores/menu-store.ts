"use client";

import { create } from "zustand";
import { appClient } from "@/lib/api";
import type { LinkType, Menu } from "@/lib/api/menu";

interface TreeNode {
  id: string;
  name: string;
  code: string;
  icon?: string | null;
  linkType: LinkType;
  url?: string | null;
  children: TreeNode[];
}

interface MenuState {
  menus: Menu[];
  treeMenus: TreeNode[];
  loading: boolean;
  fetched: boolean;
  fetchMenus: () => Promise<void>;
  refetchMenus: () => Promise<void>;
}

function buildTree(menus: Menu[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const menu of menus) {
    map.set(menu.id, {
      id: menu.id,
      name: menu.name,
      code: menu.code,
      icon: menu.icon,
      linkType: menu.linkType,
      url: menu.url,
      children: [],
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

  function sortChildren(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      const aMenu = menus.find((m) => m.id === a.id);
      const bMenu = menus.find((m) => m.id === b.id);
      return (aMenu?.sortOrder ?? 0) - (bMenu?.sortOrder ?? 0);
    });
    for (const node of nodes) {
      sortChildren(node.children);
    }
  }
  sortChildren(roots);

  return roots;
}

export const useMenuStore = create<MenuState>((set, get) => ({
  menus: [],
  treeMenus: [],
  loading: false,
  fetched: false,

  fetchMenus: async () => {
    if (get().fetched) return;

    set({ loading: true });
    try {
      const res = await appClient.api["menu-role"].mine.$get();
      if (res.ok) {
        const data = await res.json();
        const menus = data.menus;
        const treeMenus = buildTree(menus);
        set({ menus, treeMenus, fetched: true });
      }
    } catch {
      // Keep existing state on error
    } finally {
      set({ loading: false });
    }
  },

  refetchMenus: async () => {
    set({ fetched: false });
    await get().fetchMenus();
  },
}));
