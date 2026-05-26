import { appClient } from "./app-client";
import { withFeedbackApi } from "./utils";

export type LinkType = "GROUP" | "INTERNAL" | "EXTERNAL";

export interface Menu {
  id: string;
  appId: string;
  parentId?: string | null;
  name: string;
  code: string;
  icon?: string | null;
  linkType: LinkType;
  url?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMenuInput {
  name: string;
  code: string;
  appId: string;
  parentId?: string;
  icon?: string;
  linkType?: LinkType;
  url?: string;
}

export interface UpdateMenuInput {
  name?: string;
  code?: string;
  icon?: string | null;
  linkType?: LinkType;
  url?: string | null;
  sortOrder?: number;
}

export async function listMenus(appId: string): Promise<Menu[]> {
  const res = await withFeedbackApi(appClient.api.menu.$get)({
    query: { appId },
  });
  const data = await res.json();
  return data.menus;
}

export async function getMenu(id: string): Promise<Menu> {
  const res = await withFeedbackApi(appClient.api.menu[":id"].$get)({
    param: { id },
  });
  return res.json();
}

export async function createMenu(input: CreateMenuInput): Promise<Menu> {
  const res = await withFeedbackApi(appClient.api.menu.$post)({
    json: input,
  });
  return res.json();
}

export async function updateMenu(
  id: string,
  input: UpdateMenuInput,
): Promise<Menu> {
  const res = await withFeedbackApi(appClient.api.menu[":id"].$put)({
    param: { id },
    json: input,
  });
  return res.json();
}

export async function deleteMenu(id: string): Promise<void> {
  await withFeedbackApi(appClient.api.menu[":id"].$delete)({
    param: { id },
  });
}

export interface ReorderItem {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

export async function reorderMenus(items: ReorderItem[]): Promise<Menu[]> {
  const res = await withFeedbackApi(appClient.api.menu.reorder.$post)({
    json: { items },
  });
  const data = await res.json();
  return data.menus;
}
