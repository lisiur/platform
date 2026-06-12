"use client";

import { create } from "zustand";
import { appClient } from "@/lib/api";

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
  resetMenus: () => void;
}

let inflight: Promise<void> | null = null;
let requestVersion = 0;

export function getFirstMenuUrl(menus: Menu[]): string | null {
  const parentIds = new Set<string>();
  for (const menu of menus) {
    if (menu.parentId) parentIds.add(menu.parentId);
  }

  const sorted = [...menus].sort((a, b) => a.sortOrder - b.sortOrder);
  const roots = sorted.filter(
    (menu) => !menu.parentId || !parentIds.has(menu.id),
  );

  function findFirstLeaf(nodes: Menu[]): string | null {
    for (const node of nodes) {
      const children = sorted.filter((menu) => menu.parentId === node.id);
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
    if (inflight) return inflight;

    const version = ++requestVersion;
    set({ loading: true });
    inflight = (async () => {
      try {
        const res = await appClient.api.menus.mine.$get();
        if (!res.ok) throw new Error("Failed to load menus");
        const data = await res.json();
        const menus = data.menus;
        const treeMenus = buildTree(menus);
        if (version === requestVersion) {
          set({ menus, treeMenus, fetched: true });
        }
      } finally {
        if (version === requestVersion) {
          set({ loading: false });
          inflight = null;
        }
      }
    })();

    return inflight;
  },

  refetchMenus: async () => {
    requestVersion++;
    inflight = null;
    set({ fetched: false });
    await get().fetchMenus();
  },

  resetMenus: () => {
    requestVersion++;
    inflight = null;
    set({ menus: [], treeMenus: [], fetched: false, loading: false });
  },
}));
