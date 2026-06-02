import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import type { LinkType } from "../../prisma/generated/prisma/enums";
import { createPermission } from "./permission.service";

type ReorderItem = {
  id: string;
  parentId: string | null;
  sortOrder: number;
};

type SortableMenu = {
  id: string;
  parentId: string | null;
  sortOrder: number;
};

type MenuReorderTx = {
  menu: Pick<typeof prisma.menu, "findMany" | "update">;
};

function menuPermissionCode(menuCode: string) {
  return `menu-item:${menuCode}::view`;
}

export function getAffectedParentIds(
  items: ReorderItem[],
  existingMenus: SortableMenu[],
) {
  const existingById = new Map(existingMenus.map((menu) => [menu.id, menu]));
  const affectedParentIds = new Set<string | null>();

  for (const item of items) {
    const existing = existingById.get(item.id);
    if (!existing) {
      throw new HTTPException(400, {
        message: "One or more menu items not found",
      });
    }
    if (existing.parentId !== item.parentId) {
      affectedParentIds.add(existing.parentId);
    }
    affectedParentIds.add(item.parentId);
  }

  return affectedParentIds;
}

export function getNormalizedSortOrderUpdates<T extends SortableMenu>(
  menus: T[],
) {
  const groups = new Map<string | null, T[]>();

  for (const menu of menus) {
    const key = menu.parentId ?? null;
    const group = groups.get(key) || [];
    group.push(menu);
    groups.set(key, group);
  }

  return [...groups.values()].flatMap((group) =>
    group
      .toSorted((a, b) => a.sortOrder - b.sortOrder)
      .map((menu, sortOrder) => ({ id: menu.id, sortOrder }))
      .filter((update) => {
        const menu = group.find((item) => item.id === update.id);
        return menu?.sortOrder !== update.sortOrder;
      }),
  );
}

export async function getMenuById(id: string) {
  const menu = await prisma.menu.findUnique({ where: { id } });
  if (!menu) {
    throw new HTTPException(404, { message: "Menu not found" });
  }
  return menu;
}

export async function createMenu(data: {
  appId: string;
  name: string;
  code: string;
  parentId?: string | null;
  icon?: string | null;
  linkType: LinkType;
  url?: string | null;
}) {
  const app = await prisma.application.findFirst({
    where: { id: data.appId, deletedAt: null },
  });
  if (!app) {
    throw new HTTPException(400, { message: "Application not found" });
  }

  if (data.parentId) {
    const parent = await prisma.menu.findFirst({
      where: { id: data.parentId, appId: data.appId },
    });
    if (!parent) {
      throw new HTTPException(400, {
        message: "Parent menu not found in the same application",
      });
    }
    if (parent.linkType !== "GROUP") {
      throw new HTTPException(400, {
        message:
          "Cannot add children to a non-grouping menu (linkType must be GROUP)",
      });
    }
  }

  const maxSort = await prisma.menu.aggregate({
    where: { appId: data.appId, parentId: data.parentId ?? null },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  const permCode = menuPermissionCode(data.code);
  const permission = await createPermission({
    appId: data.appId,
    name: `Menu: ${data.name}`,
    code: permCode,
    group: "menu-item",
    description: `View access for menu "${data.name}"`,
  });

  return prisma.menu.create({
    data: {
      name: data.name,
      code: data.code,
      appId: data.appId,
      parentId: data.parentId,
      icon: data.icon,
      linkType: data.linkType,
      url: data.url,
      sortOrder,
      permissionId: permission.id,
    },
  });
}

export async function updateMenu(
  id: string,
  data: {
    name?: string;
    code?: string;
    icon?: string | null;
    linkType?: LinkType;
    url?: string | null;
    sortOrder?: number;
  },
) {
  const existing = await prisma.menu.findUnique({
    where: { id },
    include: { children: true, permission: true },
  });
  if (!existing) {
    throw new HTTPException(404, { message: "Menu not found" });
  }

  const effectiveLinkType = data.linkType ?? existing.linkType;

  if (
    effectiveLinkType !== "GROUP" &&
    existing.children.length > 0 &&
    data.linkType !== undefined
  ) {
    throw new HTTPException(400, {
      message:
        "Cannot change linkType of a menu that has children. Remove children first.",
    });
  }

  if (effectiveLinkType !== "GROUP" && !data.url && !existing.url) {
    throw new HTTPException(400, {
      message: "URL is required when linkType is INTERNAL or EXTERNAL",
    });
  }

  let permissionId = existing.permissionId;

  if (data.code && data.code !== existing.code) {
    const newPermCode = menuPermissionCode(data.code);
    await prisma.permission.delete({
      where: { id: existing.permissionId },
    });
    const newPermission = await createPermission({
      appId: existing.appId,
      name: `Menu: ${data.name ?? existing.name}`,
      code: newPermCode,
      group: "menu-item",
      description: `View access for menu "${data.name ?? existing.name}"`,
    });
    permissionId = newPermission.id;
  }

  return prisma.menu.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.code !== undefined && { code: data.code }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.linkType !== undefined && { linkType: data.linkType }),
      ...(data.url !== undefined && { url: data.url }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      permissionId,
    },
  });
}

export async function deleteMenu(id: string) {
  const existing = await prisma.menu.findUnique({
    where: { id },
    include: { permission: true },
  });
  if (!existing) {
    throw new HTTPException(404, { message: "Menu not found" });
  }
  await prisma.menu.delete({ where: { id } });
  return { name: existing.name };
}

export async function listMenus(appId: string) {
  const menus = await prisma.menu.findMany({
    where: { appId },
    orderBy: { sortOrder: "asc" },
  });
  return { menus };
}

export async function reorderMenus(items: ReorderItem[]) {
  const itemIds = items.map((i) => i.id);

  const existingMenus = await prisma.menu.findMany({
    where: { id: { in: itemIds } },
  });

  if (existingMenus.length !== itemIds.length) {
    throw new HTTPException(400, {
      message: "One or more menu items not found",
    });
  }

  const affectedParentIds = getAffectedParentIds(items, existingMenus);

  const updatedMenus = await prisma.$transaction(async (tx: MenuReorderTx) => {
    for (const item of items) {
      await tx.menu.update({
        where: { id: item.id },
        data: {
          sortOrder: item.sortOrder,
          parentId: item.parentId,
        },
      });
    }

    const allMenus = await tx.menu.findMany({
      where: {
        OR: [...affectedParentIds].map((pid) => ({
          parentId: pid,
        })),
      },
      orderBy: { sortOrder: "asc" },
    });

    for (const update of getNormalizedSortOrderUpdates(allMenus)) {
      await tx.menu.update({
        where: { id: update.id },
        data: { sortOrder: update.sortOrder },
      });
    }

    const appId = existingMenus[0].appId;
    return tx.menu.findMany({
      where: { appId },
      orderBy: { sortOrder: "asc" },
    });
  });

  return { menus: updatedMenus };
}
