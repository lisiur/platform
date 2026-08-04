import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    roleAssignment: {
      findMany: vi.fn(),
    },
    menu: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "#lib/db";
import { menuPermissionsInclude } from "#modules/application/public";
import {
  getMenusForUser,
  getUserPermissions,
  matchPermission,
} from "./role-permission.service";

const mockPrisma = prisma as unknown as {
  roleAssignment: {
    findMany: ReturnType<typeof vi.fn>;
  };
  menu: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

describe("getUserPermissions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns permission codes from the user's role assignments", async () => {
    mockPrisma.roleAssignment.findMany.mockResolvedValue([
      {
        role: {
          code: "system/admin",
          rolePermissions: [
            { permission: { code: "system/role:create" } },
            { permission: { code: "system/user:read" } },
          ],
        },
      },
    ]);

    await expect(getUserPermissions("user1")).resolves.toEqual([
      "system/role:create",
      "system/user:read",
    ]);
    expect(mockPrisma.roleAssignment.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user1",
        role: { code: { startsWith: "system/" } },
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: { select: { code: true } } },
            },
          },
        },
      },
    });
  });
});

describe("getMenusForUser", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.roleAssignment.findMany.mockResolvedValue([
      {
        role: {
          code: "org:org1/owner",
          rolePermissions: [
            { permission: { code: "organization-member::list" } },
            { permission: { code: "organization-settings::view" } },
          ],
        },
      },
    ]);
  });

  it("returns org-app menus whose required permissions the user holds", async () => {
    const menus = [
      {
        id: "organization-members",
        appId: "organization",
        code: "members",
        sortOrder: 0,
        menuPermissions: [
          {
            permission: {
              id: "p1",
              code: "organization-member::list",
              name: "List Members",
              group: "organization-member",
            },
          },
        ],
      },
      {
        id: "organization-settings",
        appId: "organization",
        code: "settings",
        sortOrder: 1,
        menuPermissions: [
          {
            permission: {
              id: "p2",
              code: "organization-settings::view",
              name: "View Settings",
              group: "organization-settings",
            },
          },
        ],
      },
    ];
    mockPrisma.menu.findMany.mockResolvedValue(menus);

    await expect(
      getMenusForUser("user1", "organization", "org:org1"),
    ).resolves.toEqual([
      {
        id: "organization-members",
        appId: "organization",
        code: "members",
        sortOrder: 0,
        permissions: [
          {
            id: "p1",
            code: "organization-member::list",
            name: "List Members",
            group: "organization-member",
          },
        ],
      },
      {
        id: "organization-settings",
        appId: "organization",
        code: "settings",
        sortOrder: 1,
        permissions: [
          {
            id: "p2",
            code: "organization-settings::view",
            name: "View Settings",
            group: "organization-settings",
          },
        ],
      },
    ]);

    expect(mockPrisma.menu.findMany).toHaveBeenCalledWith({
      where: {
        appId: "organization",
        OR: [
          {
            menuPermissions: {
              some: {
                permission: {
                  code: {
                    in: [
                      "organization-member::list",
                      "organization-settings::view",
                    ],
                  },
                },
              },
            },
          },
          {
            AND: [
              { linkType: { not: "GROUP" } },
              { menuPermissions: { none: {} } },
            ],
          },
        ],
      },
      orderBy: { sortOrder: "asc" },
      include: menuPermissionsInclude,
    });
  });

  it("includes parent GROUP menus that have no own permissions but accessible children", async () => {
    const accessibleMenus = [
      {
        id: "child-menu",
        appId: "organization",
        parentId: "parent-folder",
        code: "child",
        name: "Child",
        icon: null,
        linkType: "INTERNAL",
        url: "/child",
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        menuPermissions: [
          {
            permission: {
              id: "p1",
              code: "organization-member::list",
              name: "List Members",
              group: "organization-member",
            },
          },
        ],
      },
    ];

    const allMenus = [
      { id: "parent-folder", parentId: null },
      { id: "child-menu", parentId: "parent-folder" },
    ];

    const ancestorMenus = [
      {
        id: "parent-folder",
        appId: "organization",
        parentId: null,
        code: "folder",
        name: "Folder",
        icon: null,
        linkType: "GROUP",
        url: null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        menuPermissions: [],
      },
    ];

    mockPrisma.menu.findMany.mockImplementation(
      (args: Record<string, unknown>) => {
        if (args.select) {
          return Promise.resolve(allMenus);
        }
        if (
          args.where &&
          typeof args.where === "object" &&
          "id" in args.where
        ) {
          return Promise.resolve(ancestorMenus);
        }
        return Promise.resolve(accessibleMenus);
      },
    );

    const result = await getMenusForUser("user1", "organization", "org:org1");

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("parent-folder");
    expect(result[0].permissions).toEqual([]);
    expect(result[1].id).toBe("child-menu");
    expect(result[1].permissions).toHaveLength(1);
  });

  it("includes grandparent GROUP menus at any depth", async () => {
    const accessibleMenus = [
      {
        id: "leaf-menu",
        appId: "organization",
        parentId: "mid-folder",
        code: "leaf",
        name: "Leaf",
        icon: null,
        linkType: "INTERNAL",
        url: "/leaf",
        sortOrder: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        menuPermissions: [
          {
            permission: {
              id: "p1",
              code: "organization-member::list",
              name: "List Members",
              group: "organization-member",
            },
          },
        ],
      },
    ];

    const allMenus = [
      { id: "root-folder", parentId: null },
      { id: "mid-folder", parentId: "root-folder" },
      { id: "leaf-menu", parentId: "mid-folder" },
    ];

    const ancestorMenus = [
      {
        id: "root-folder",
        appId: "organization",
        parentId: null,
        code: "root",
        name: "Root",
        icon: null,
        linkType: "GROUP",
        url: null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        menuPermissions: [],
      },
      {
        id: "mid-folder",
        appId: "organization",
        parentId: "root-folder",
        code: "mid",
        name: "Mid",
        icon: null,
        linkType: "GROUP",
        url: null,
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        menuPermissions: [],
      },
    ];

    mockPrisma.menu.findMany.mockImplementation(
      (args: Record<string, unknown>) => {
        if (args.select) {
          return Promise.resolve(allMenus);
        }
        if (
          args.where &&
          typeof args.where === "object" &&
          "id" in args.where
        ) {
          return Promise.resolve(ancestorMenus);
        }
        return Promise.resolve(accessibleMenus);
      },
    );

    const result = await getMenusForUser("user1", "organization", "org:org1");

    expect(result).toHaveLength(3);
    const ids = result.map((m: { id: string }) => m.id);
    expect(ids).toContain("root-folder");
    expect(ids).toContain("mid-folder");
    expect(ids).toContain("leaf-menu");
  });

  it("includes leaf menus with no permission requirements", async () => {
    const accessibleMenus = [
      {
        id: "public-page",
        appId: "organization",
        parentId: null,
        code: "public",
        name: "Public",
        icon: null,
        linkType: "INTERNAL",
        url: "/public",
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        menuPermissions: [],
      },
    ];

    mockPrisma.menu.findMany.mockImplementation(
      (args: Record<string, unknown>) => {
        if (args.select) {
          return Promise.resolve([{ id: "public-page", parentId: null }]);
        }
        return Promise.resolve(accessibleMenus);
      },
    );

    const result = await getMenusForUser("user1", "organization", "org:org1");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("public-page");
    expect(result[0].permissions).toEqual([]);
  });
});

describe("matchPermission", () => {
  it("matches an exact positive permission", () => {
    expect(matchPermission(["department::create"], "department::create")).toBe(
      true,
    );
  });

  it("matches a wildcard scope group::*", () => {
    expect(matchPermission(["department::*"], "department::delete")).toBe(true);
  });

  it("matches the global wildcard *", () => {
    expect(matchPermission(["*"], "anything::goes")).toBe(true);
  });

  it("negation overrides an otherwise-matching positive rule", () => {
    expect(
      matchPermission(
        ["department::*", "!department::delete"],
        "department::delete",
      ),
    ).toBe(false);
  });

  it("returns false when no permission matches", () => {
    expect(matchPermission(["role::create"], "department::create")).toBe(false);
  });

  it("returns false for an empty permission set", () => {
    expect(matchPermission([], "department::create")).toBe(false);
  });
});
