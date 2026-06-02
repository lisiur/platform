"use client";

import { create } from "zustand";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

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

interface TreeNode {
  id: string;
  name: string;
  code: string;
  icon?: string | null;
  linkType: LinkType;
  url: string | null;
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

export function getFirstMenuUrl(menus: Menu[]): string | null {
  const parentIds = new Set<string>();
  for (const m of menus) {
    if (m.parentId) parentIds.add(m.parentId);
  }

  const sorted = [...menus].sort((a, b) => a.sortOrder - b.sortOrder);

  const roots = sorted.filter((m) => !m.parentId || !parentIds.has(m.id));
  function findFirstLeaf(nodes: Menu[]): string | null {
    for (const node of nodes) {
      const children = sorted.filter((m) => m.parentId === node.id);
      if (children.length === 0) {
        return node.url ?? null;
      }
      const leafUrl = findFirstLeaf(children);
      if (leafUrl) return leafUrl;
    }
    return null;
  }

  return findFirstLeaf(roots);
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
      const res = await withApiFeedback(appClient.api.menu.mine.$get)();
      const data = await res.json();
      const menus = data.menus;
      const treeMenus = buildTree(menus);
      set({ menus, treeMenus, fetched: true });
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
