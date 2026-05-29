import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

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
  linkType: string;
  url?: string | null;
}) {
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
    },
  });
}

export async function updateMenu(
  id: string,
  data: {
    name?: string;
    code?: string;
    icon?: string | null;
    linkType?: string;
    url?: string | null;
    sortOrder?: number;
  },
) {
  const existing = await prisma.menu.findUnique({
    where: { id },
    include: { children: true },
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

  if (effectiveLinkType === "EXTERNAL" && !data.url && !existing.url) {
    throw new HTTPException(400, {
      message: "URL is required when linkType is EXTERNAL",
    });
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
    },
  });
}

export async function deleteMenu(id: string) {
  const existing = await prisma.menu.findUnique({ where: { id } });
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

export async function reorderMenus(
  items: Array<{ id: string; parentId: string | null; sortOrder: number }>,
) {
  const itemIds = items.map((i) => i.id);

  const existingMenus = await prisma.menu.findMany({
    where: { id: { in: itemIds } },
  });

  if (existingMenus.length !== itemIds.length) {
    throw new HTTPException(400, {
      message: "One or more menu items not found",
    });
  }

  const affectedParentIds = new Set<string | null>();
  for (const item of items) {
    const existing = existingMenus.find((m) => m.id === item.id);
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

  const updatedMenus = await prisma.$transaction(async (tx) => {
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

    const groups = new Map<string | null, typeof allMenus>();
    for (const menu of allMenus) {
      const key = menu.parentId ?? null;
      const group = groups.get(key) || [];
      group.push(menu);
      groups.set(key, group);
    }

    for (const [, group] of groups) {
      for (let i = 0; i < group.length; i++) {
        if (group[i].sortOrder !== i) {
          await tx.menu.update({
            where: { id: group[i].id },
            data: { sortOrder: i },
          });
        }
      }
    }

    const appId = existingMenus[0].appId;
    return tx.menu.findMany({
      where: { appId },
      orderBy: { sortOrder: "asc" },
    });
  });

  return { menus: updatedMenus };
}
