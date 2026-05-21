import { appClient } from "./app-client";

export interface Menu {
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
  createdAt: string;
  updatedAt: string;
}

export interface CreateMenuInput {
  name: string;
  code: string;
  appId: string;
  parentId?: string;
  icon?: string;
  url?: string;
  isExternal?: boolean;
  isVisible?: boolean;
}

export interface UpdateMenuInput {
  name?: string;
  code?: string;
  icon?: string | null;
  url?: string | null;
  sortOrder?: number;
  isExternal?: boolean;
  isVisible?: boolean;
}

export async function listMenus(appId: string): Promise<Menu[]> {
  const res = await appClient.api.menu.$get({ query: { appId } });
  if (!res.ok) throw new Error("Failed to list menus");
  const data = await res.json();
  return data.menus;
}

export async function getMenu(id: string): Promise<Menu> {
  const res = await appClient.api.menu[":id"].$get({ param: { id } });
  if (!res.ok) throw new Error("Failed to get menu");
  return res.json();
}

export async function createMenu(input: CreateMenuInput): Promise<Menu> {
  const res = await appClient.api.menu.$post({ json: input });
  if (!res.ok) throw new Error("Failed to create menu");
  return res.json();
}

export async function updateMenu(
  id: string,
  input: UpdateMenuInput,
): Promise<Menu> {
  const res = await appClient.api.menu[":id"].$put({
    param: { id },
    json: input,
  });
  if (!res.ok) throw new Error("Failed to update menu");
  return res.json();
}

export async function deleteMenu(id: string): Promise<void> {
  const res = await appClient.api.menu[":id"].$delete({ param: { id } });
  if (!res.ok) throw new Error("Failed to delete menu");
}

export interface ReorderItem {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

export async function reorderMenus(items: ReorderItem[]): Promise<Menu[]> {
  const res = await appClient.api.menu.reorder.$post({ json: { items } });
  if (!res.ok) throw new Error("Failed to reorder menus");
  const data = await res.json();
  return data.menus;
}
