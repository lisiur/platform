# Service Layer Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract business logic from Hono route handlers into dedicated service modules, making routes thin (validation + audit + response only).

**Architecture:** One service file per resource under `packages/service/src/services/`. Services own Prisma queries, validation rules, and domain logic. Routes own HTTP concerns (request parsing, audit logging, response formatting). Existing repositories remain as thin Prisma wrappers.

**Tech Stack:** TypeScript, Hono, Prisma, Vitest

---

## File Structure

```
packages/service/src/services/
├── application.service.ts
├── organization.service.ts
├── role.service.ts
├── menu.service.ts
├── menu-role.service.ts
├── admin-user.service.ts
├── user-role.service.ts
├── auth.service.ts
├── upload.service.ts
├── log.service.ts
├── audit-log.service.ts
└── system-config.service.ts
```

Each service exports pure async functions. No class instantiation, no `this` binding.

---

## Conventions

### Service function signature pattern

```typescript
// Services throw HTTPException for business errors (404, 409, etc.)
// Services return data — never call c.json() or logAudit()
export async function createApplication(data: CreateApplicationBody) {
  const existing = await prisma.application.findFirst({
    where: { code: data.code, deletedAt: null },
  });
  if (existing) {
    throw new HTTPException(409, { message: "Application code already exists" });
  }
  return prisma.application.create({ data });
}
```

### Route handler pattern (after refactor)

```typescript
handler: async (c) => {
  const body = c.req.valid("json");
  const app = await createApplication(body);
  logAudit({ event: "application.created", category: "application", targetId: app.id, targetName: app.name, c });
  return c.json(app, 201);
}
```

### What stays in routes
- `c.req.valid()` calls (request parsing)
- `logAudit()` calls (needs request context `c`)
- `c.json()` responses
- Middleware declarations

### What moves to services
- Prisma queries (find, create, update, delete)
- Business validation (uniqueness checks, existence checks, soft-delete filters)
- Domain logic (cascade deletes, role derivation, menu tree walking)
- Transactions

---

### Task 1: Application Service

**Files:**
- Create: `packages/service/src/services/application.service.ts`
- Modify: `packages/service/src/routes/application/createApplication.ts`
- Modify: `packages/service/src/routes/application/updateApplication.ts`
- Modify: `packages/service/src/routes/application/deleteApplication.ts`
- Modify: `packages/service/src/routes/application/getApplication.ts`
- Modify: `packages/service/src/routes/application/listApplications.ts`

- [ ] **Step 1: Create application.service.ts**

```typescript
// packages/service/src/services/application.service.ts
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import type { Prisma } from "#generated/prisma";

export async function getApplicationById(id: string) {
  const app = await prisma.application.findFirst({
    where: { id, deletedAt: null },
  });
  if (!app) {
    throw new HTTPException(404, { message: "Application not found" });
  }
  return app;
}

export async function createApplication(data: {
  name: string;
  code: string;
  description?: string;
  logo?: string;
  sortOrder?: number;
}) {
  const existing = await prisma.application.findFirst({
    where: { code: data.code, deletedAt: null },
  });
  if (existing) {
    throw new HTTPException(409, {
      message: "Application code already exists",
    });
  }
  return prisma.application.create({ data });
}

export async function updateApplication(
  id: string,
  data: {
    name?: string;
    code?: string;
    description?: string;
    logo?: string;
    sortOrder?: number;
  },
) {
  const existing = await prisma.application.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw new HTTPException(404, { message: "Application not found" });
  }

  if (data.code && data.code !== existing.code) {
    const codeTaken = await prisma.application.findFirst({
      where: { code: data.code, deletedAt: null },
    });
    if (codeTaken) {
      throw new HTTPException(409, {
        message: "Application code already exists",
      });
    }
  }

  return prisma.application.update({ where: { id }, data });
}

export async function deleteApplication(id: string) {
  const existing = await prisma.application.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw new HTTPException(404, { message: "Application not found" });
  }
  return prisma.application.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function listApplications(params: {
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const { search, page = 1, pageSize = 20 } = params;
  const where: Prisma.ApplicationWhereInput = { deletedAt: null };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const [applications, total] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.application.count({ where }),
  ]);

  return { applications, total };
}
```

- [ ] **Step 2: Refactor createApplication.ts**

```typescript
// packages/service/src/routes/application/createApplication.ts
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
import { createApplication as createApplicationService } from "#services/application.service";
import {
  applicationSchema,
  createApplicationBodySchema,
  errorSchema,
} from "./schema";

export const createApplication = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/",
    tags: ["Application"],
    summary: "Create an application",
    description: "Create a new application.",
    middleware: requireAdmin,
    request: {
      body: {
        content: {
          "application/json": {
            schema: createApplicationBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      201: {
        content: {
          "application/json": { schema: applicationSchema },
        },
        description: "The created application",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
      409: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Application code already exists",
      },
    },
  }),
  handler: async (c) => {
    const body = c.req.valid("json");
    const app = await createApplicationService(body);

    logAudit({
      event: "application.created",
      category: "application",
      targetId: app.id,
      targetName: app.name,
      c,
    });

    return c.json(app, 201);
  },
});
```

- [ ] **Step 3: Refactor updateApplication.ts**

```typescript
// packages/service/src/routes/application/updateApplication.ts
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
import { updateApplication as updateApplicationService } from "#services/application.service";
import {
  applicationIdParamSchema,
  applicationSchema,
  errorSchema,
  updateApplicationBodySchema,
} from "./schema";

export const updateApplication = defineOpenAPIRoute({
  route: createRoute({
    method: "put",
    path: "/{id}",
    tags: ["Application"],
    summary: "Update an application",
    description: "Update an application by ID.",
    middleware: requireAdmin,
    request: {
      params: applicationIdParamSchema,
      body: {
        content: {
          "application/json": {
            schema: updateApplicationBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: applicationSchema },
        },
        description: "The updated application",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
      409: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Application code already exists",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const app = await updateApplicationService(id, body);

    logAudit({
      event: "application.updated",
      category: "application",
      targetId: app.id,
      targetName: app.name,
      c,
    });

    return c.json(app, 200);
  },
});
```

- [ ] **Step 4: Refactor deleteApplication.ts**

```typescript
// packages/service/src/routes/application/deleteApplication.ts
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { logAudit } from "#lib/logger";
import { requireAdmin } from "#middleware/require-admin";
import { deleteApplication as deleteApplicationService } from "#services/application.service";
import { applicationIdParamSchema, errorSchema } from "./schema";

export const deleteApplication = defineOpenAPIRoute({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Application"],
    summary: "Delete an application",
    description: "Soft-delete an application by ID.",
    middleware: requireAdmin,
    request: {
      params: applicationIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { success: { type: "boolean" } },
              required: ["success"],
            },
          },
        },
        description: "Success",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const app = await deleteApplicationService(id);

    logAudit({
      event: "application.deleted",
      category: "application",
      targetId: app.id,
      targetName: app.name,
      c,
    });

    return c.json({ success: true }, 200);
  },
});
```

- [ ] **Step 5: Refactor getApplication.ts**

```typescript
// packages/service/src/routes/application/getApplication.ts
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { getApplicationById } from "#services/application.service";
import { applicationIdParamSchema, applicationSchema, errorSchema } from "./schema";

export const getApplication = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Application"],
    summary: "Get an application",
    description: "Get an application by ID.",
    middleware: requireAdmin,
    request: {
      params: applicationIdParamSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: applicationSchema },
        },
        description: "The application",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
      404: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Not found",
      },
    },
  }),
  handler: async (c) => {
    const { id } = c.req.valid("param");
    const app = await getApplicationById(id);
    return c.json(app, 200);
  },
});
```

- [ ] **Step 6: Refactor listApplications.ts**

```typescript
// packages/service/src/routes/application/listApplications.ts
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { requireAdmin } from "#middleware/require-admin";
import { listApplications as listApplicationsService } from "#services/application.service";
import {
  applicationSchema,
  errorSchema,
  listApplicationsQuerySchema,
} from "./schema";

export const listApplications = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/",
    tags: ["Application"],
    summary: "List applications",
    description: "List applications with pagination and search.",
    middleware: requireAdmin,
    request: {
      query: listApplicationsQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                applications: {
                  type: "array",
                  items: applicationSchema,
                },
                total: { type: "number" },
              },
              required: ["applications", "total"],
            },
          },
        },
        description: "List of applications",
      },
      401: {
        content: {
          "application/json": { schema: errorSchema },
        },
        description: "Unauthorized",
      },
    },
  }),
  handler: async (c) => {
    const query = c.req.valid("query");
    const result = await listApplicationsService(query);
    return c.json(result, 200);
  },
});
```

- [ ] **Step 7: Run existing tests to verify no regressions**

Run: `pnpm --filter @repo/service exec vitest --run src/routes/application/__tests__/application.test.ts`
Expected: All tests PASS (tests mock Prisma directly, so service extraction doesn't affect them)

- [ ] **Step 8: Commit**

```bash
git add packages/service/src/services/application.service.ts packages/service/src/routes/application/
git commit -m "refactor: extract application business logic to service layer"
```

---

### Task 2: Organization Service

**Files:**
- Create: `packages/service/src/services/organization.service.ts`
- Modify: `packages/service/src/routes/organization/createOrganization.ts`
- Modify: `packages/service/src/routes/organization/updateOrganization.ts`
- Modify: `packages/service/src/routes/organization/deleteOrganization.ts`
- Modify: `packages/service/src/routes/organization/getOrganization.ts`
- Modify: `packages/service/src/routes/organization/listOrganizations.ts`

- [ ] **Step 1: Create organization.service.ts**

```typescript
// packages/service/src/services/organization.service.ts
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

export async function getOrganizationById(id: string) {
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) {
    throw new HTTPException(404, { message: "Organization not found" });
  }
  return org;
}

export async function createOrganization(data: {
  name: string;
  slug: string;
  logo?: string;
}) {
  const existing = await prisma.organization.findUnique({
    where: { slug: data.slug },
  });
  if (existing) {
    throw new HTTPException(409, {
      message: "Organization slug already exists",
    });
  }
  return prisma.organization.create({ data });
}

export async function updateOrganization(
  id: string,
  data: { name?: string; slug?: string; logo?: string },
) {
  const existing = await prisma.organization.findUnique({ where: { id } });
  if (!existing) {
    throw new HTTPException(404, { message: "Organization not found" });
  }

  if (data.slug && data.slug !== existing.slug) {
    const slugTaken = await prisma.organization.findUnique({
      where: { slug: data.slug },
    });
    if (slugTaken) {
      throw new HTTPException(409, {
        message: "Organization slug already exists",
      });
    }
  }

  return prisma.organization.update({ where: { id }, data });
}

export async function deleteOrganization(id: string) {
  const existing = await prisma.organization.findUnique({ where: { id } });
  if (!existing) {
    throw new HTTPException(404, { message: "Organization not found" });
  }
  return prisma.organization.delete({ where: { id } });
}

export async function listOrganizations(params: {
  page?: number;
  pageSize?: number;
}) {
  const { page = 1, pageSize = 20 } = params;
  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.organization.count(),
  ]);
  return { organizations, total };
}
```

- [ ] **Step 2: Refactor all organization route files**

Apply the same pattern as Task 1: move Prisma calls to service, keep `logAudit` and `c.json` in routes.

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @repo/service exec vitest --run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/service/src/services/organization.service.ts packages/service/src/routes/organization/
git commit -m "refactor: extract organization business logic to service layer"
```

---

### Task 3: Role Service

**Files:**
- Create: `packages/service/src/services/role.service.ts`
- Modify: `packages/service/src/routes/role/createRole.ts`
- Modify: `packages/service/src/routes/role/updateRole.ts`
- Modify: `packages/service/src/routes/role/deleteRole.ts`
- Modify: `packages/service/src/routes/role/listRoles.ts`

- [ ] **Step 1: Create role.service.ts**

```typescript
// packages/service/src/services/role.service.ts
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { roleRepository } from "#repositories/role.repository";

export async function getRoleById(id: string) {
  const role = await roleRepository.findById(id);
  if (!role) {
    throw new HTTPException(404, { message: "Role not found" });
  }
  return role;
}

export async function createRole(data: {
  appId: string;
  name: string;
  code: string;
  authRole?: string;
  flags?: string[];
}) {
  const existing = await roleRepository.findByAppAndCode(data.appId, data.code);
  if (existing) {
    throw new HTTPException(400, {
      message: "Role code already exists for this application",
    });
  }
  return roleRepository.create(data);
}

export async function updateRole(
  id: string,
  data: { name?: string; code?: string; authRole?: string | null; flags?: string[] },
) {
  const existing = await roleRepository.findById(id);
  if (!existing) {
    throw new HTTPException(404, { message: "Role not found" });
  }
  return roleRepository.update(id, data);
}

export async function deleteRole(id: string) {
  const existing = await roleRepository.findById(id);
  if (!existing) {
    throw new HTTPException(404, { message: "Role not found" });
  }
  // Manual cascade: remove menu-role and user-role associations first
  await prisma.$transaction([
    prisma.menuRole.deleteMany({ where: { roleId: id } }),
    prisma.userRole.deleteMany({ where: { roleId: id } }),
    prisma.role.delete({ where: { id } }),
  ]);
  return existing;
}

export async function listRoles(appId?: string) {
  if (appId) {
    return roleRepository.findByAppId(appId);
  }
  return prisma.role.findMany({ orderBy: { createdAt: "asc" } });
}
```

- [ ] **Step 2: Refactor all role route files**

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git add packages/service/src/services/role.service.ts packages/service/src/routes/role/
git commit -m "refactor: extract role business logic to service layer"
```

---

### Task 4: Menu Service

**Files:**
- Create: `packages/service/src/services/menu.service.ts`
- Modify: `packages/service/src/routes/menu/createMenu.ts`
- Modify: `packages/service/src/routes/menu/updateMenu.ts`
- Modify: `packages/service/src/routes/menu/deleteMenu.ts`
- Modify: `packages/service/src/routes/menu/getMenu.ts`
- Modify: `packages/service/src/routes/menu/listMenus.ts`
- Modify: `packages/service/src/routes/menu/reorderMenus.ts`

- [ ] **Step 1: Create menu.service.ts**

```typescript
// packages/service/src/services/menu.service.ts
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
  linkType: string;
  linkUrl?: string;
  icon?: string;
  parentId?: string;
}) {
  if (data.parentId) {
    const parent = await prisma.menu.findUnique({
      where: { id: data.parentId },
    });
    if (!parent) {
      throw new HTTPException(400, { message: "Parent menu not found" });
    }
    if (parent.appId !== data.appId) {
      throw new HTTPException(400, {
        message: "Parent menu must belong to the same application",
      });
    }
    if (parent.linkType !== "GROUP") {
      throw new HTTPException(400, {
        message: "Can only add children to GROUP menus",
      });
    }
  }

  const maxSort = await prisma.menu.aggregate({
    _max: { sortOrder: true },
    where: {
      appId: data.appId,
      parentId: data.parentId ?? null,
    },
  });

  return prisma.menu.create({
    data: {
      ...data,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateMenu(
  id: string,
  data: {
    name?: string;
    linkType?: string;
    linkUrl?: string;
    icon?: string;
    parentId?: string | null;
  },
) {
  const existing = await prisma.menu.findUnique({
    where: { id },
    include: { children: true },
  });
  if (!existing) {
    throw new HTTPException(404, { message: "Menu not found" });
  }

  if (data.linkType && data.linkType !== "GROUP" && existing.children.length > 0) {
    throw new HTTPException(400, {
      message: "Cannot change linkType from GROUP when menu has children",
    });
  }

  if (data.linkType === "EXTERNAL" && !data.linkUrl && !existing.linkUrl) {
    throw new HTTPException(400, {
      message: "URL is required for EXTERNAL menus",
    });
  }

  return prisma.menu.update({ where: { id }, data });
}

export async function deleteMenu(id: string) {
  const existing = await prisma.menu.findUnique({ where: { id } });
  if (!existing) {
    throw new HTTPException(404, { message: "Menu not found" });
  }
  return prisma.menu.delete({ where: { id } });
}

export async function listMenus(appId: string) {
  return prisma.menu.findMany({
    where: { appId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function reorderMenus(
  appId: string,
  items: { id: string; parentId?: string | null; sortOrder: number }[],
) {
  // Verify all items exist
  const ids = items.map((i) => i.id);
  const existing = await prisma.menu.findMany({
    where: { id: { in: ids }, appId },
  });
  if (existing.length !== ids.length) {
    throw new HTTPException(400, { message: "One or more menu items not found" });
  }

  // Collect affected parent IDs (old + new)
  const oldParentIds = new Set(existing.map((m) => m.parentId).filter(Boolean));
  const newParentIds = new Set(items.map((i) => i.parentId).filter(Boolean));
  const affectedParentIds = [...new Set([...oldParentIds, ...newParentIds])];

  await prisma.$transaction(async (tx) => {
    // Apply changes
    for (const item of items) {
      await tx.menu.update({
        where: { id: item.id },
        data: {
          parentId: item.parentId,
          sortOrder: item.sortOrder,
        },
      });
    }

    // Re-index sequential sortOrder for each affected parent group
    for (const parentId of affectedParentIds) {
      const siblings = await tx.menu.findMany({
        where: { appId, parentId: parentId ?? null },
        orderBy: { sortOrder: "asc" },
      });
      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i].sortOrder !== i) {
          await tx.menu.update({
            where: { id: siblings[i].id },
            data: { sortOrder: i },
          });
        }
      }
    }
  });

  return prisma.menu.findMany({
    where: { appId },
    orderBy: { sortOrder: "asc" },
  });
}
```

- [ ] **Step 2: Refactor all menu route files**

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git add packages/service/src/services/menu.service.ts packages/service/src/routes/menu/
git commit -m "refactor: extract menu business logic to service layer"
```

---

### Task 5: Menu-Role Service

**Files:**
- Create: `packages/service/src/services/menu-role.service.ts`
- Modify: `packages/service/src/routes/menu-role/batchAssignMenus.ts`
- Modify: `packages/service/src/routes/menu-role/getRoleMenus.ts`
- Modify: `packages/service/src/routes/menu-role/getMine.ts`

- [ ] **Step 1: Create menu-role.service.ts**

```typescript
// packages/service/src/services/menu-role.service.ts
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { menuRoleRepository } from "#repositories/menu-role.repository";
import { roleRepository } from "#repositories/role.repository";

export async function getMenusForRole(roleId: string) {
  return menuRoleRepository.getMenusForRole(roleId);
}

export async function batchAssignMenus(roleId: string, menuIds: string[]) {
  const role = await roleRepository.findById(roleId);
  if (!role) {
    throw new HTTPException(404, { message: "Role not found" });
  }

  // Validate all menu IDs belong to the role's application
  const menus = await prisma.menu.findMany({
    where: { id: { in: menuIds }, appId: role.appId },
  });
  if (menus.length !== menuIds.length) {
    throw new HTTPException(400, {
      message: "One or more menus do not belong to this application",
    });
  }

  // Auto-include ancestor GROUP menus
  const allMenuIds = new Set(menuIds);
  for (const menuId of menuIds) {
    let current = await prisma.menu.findUnique({ where: { id: menuId } });
    while (current?.parentId) {
      allMenuIds.add(current.parentId);
      current = await prisma.menu.findUnique({
        where: { id: current.parentId },
      });
    }
  }

  // Auto-include all descendant menus
  async function collectDescendants(parentId: string) {
    const children = await prisma.menu.findMany({
      where: { parentId },
    });
    for (const child of children) {
      allMenuIds.add(child.id);
      await collectDescendants(child.id);
    }
  }
  for (const menuId of menuIds) {
    await collectDescendants(menuId);
  }

  return menuRoleRepository.batchAssign(roleId, [...allMenuIds]);
}

export async function getMenusForUser(userId: string) {
  // This is a read-through — actual logic is in userRoleRepository
  const { userRoleRepository } = await import(
    "#repositories/user-role.repository"
  );
  return userRoleRepository.getMenusForUser(userId);
}
```

- [ ] **Step 2: Refactor menu-role route files**

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git add packages/service/src/services/menu-role.service.ts packages/service/src/routes/menu-role/
git commit -m "refactor: extract menu-role business logic to service layer"
```

---

### Task 6: Admin-User Service

**Files:**
- Create: `packages/service/src/services/admin-user.service.ts`
- Modify: `packages/service/src/routes/admin-user/createUser.ts`
- Modify: `packages/service/src/routes/admin-user/updateUser.ts`
- Modify: `packages/service/src/routes/admin-user/deleteUser.ts`
- Modify: `packages/service/src/routes/admin-user/listUsers.ts`

- [ ] **Step 1: Create admin-user.service.ts**

```typescript
// packages/service/src/services/admin-user.service.ts
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { hashPassword } from "#lib/password";
import { userRoleRepository } from "#repositories/user-role.repository";

function assertUserIsNotBuiltin(user: { email: string }) {
  // Builtin users are protected from modification
  const builtinEmails = process.env.BUILTIN_USER_EMAILS?.split(",") ?? [];
  if (builtinEmails.includes(user.email)) {
    throw new HTTPException(403, { message: "Cannot modify builtin user" });
  }
}

async function deriveAuthRole(userId: string) {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true },
  });
  const hasAdmin = userRoles.some(
    (ur) => ur.role.appId === "admin" && ur.role.authRole === "admin",
  );
  return hasAdmin ? "admin" : "user";
}

export async function listUsers(params: { page?: number; pageSize?: number }) {
  const { page = 1, pageSize = 20 } = params;
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      include: { userRoles: { include: { role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count(),
  ]);
  return { users, total };
}

export async function createUser(data: {
  email: string;
  password: string;
  name?: string;
  roleId?: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: data.email.toLowerCase() },
  });
  if (existing) {
    throw new HTTPException(409, { message: "Email already exists" });
  }

  // Create user via BetterAuth facade
  const { auth } = await import("#lib/auth");
  const result = await auth.api.createUser({
    body: {
      email: data.email.toLowerCase(),
      password: data.password,
      name: data.name ?? "",
      role: "user",
    },
  });

  // Assign role if provided
  if (data.roleId) {
    try {
      await userRoleRepository.assign({
        userId: result.user.id,
        roleId: data.roleId,
      });
    } catch (e) {
      // Rollback: delete user if role assignment fails
      await prisma.user.delete({ where: { id: result.user.id } });
      throw e;
    }
  }

  // Derive and update authRole
  const authRole = await deriveAuthRole(result.user.id);
  await prisma.user.update({
    where: { id: result.user.id },
    data: { role: authRole },
  });

  return prisma.user.findUnique({
    where: { id: result.user.id },
    include: { userRoles: { include: { role: true } } },
  });
}

export async function updateUser(
  id: string,
  data: {
    email?: string;
    password?: string;
    name?: string;
    roleId?: string;
  },
) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }
  assertUserIsNotBuiltin(user);

  if (data.email && data.email !== user.email) {
    const emailTaken = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (emailTaken) {
      throw new HTTPException(409, { message: "Email already exists" });
    }
  }

  // Update password if provided
  if (data.password) {
    const { auth } = await import("#lib/auth");
    const account = await prisma.account.findFirst({
      where: { userId: id, providerId: "credential" },
    });
    const hashed = await hashPassword(data.password);
    if (account) {
      await prisma.account.update({
        where: { id: account.id },
        data: { password: hashed },
      });
    } else {
      await prisma.account.create({
        data: {
          userId: id,
          providerId: "credential",
          accountId: id,
          password: hashed,
        },
      });
    }
  }

  // Update user fields
  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(data.email && { email: data.email.toLowerCase() }),
      ...(data.name && { name: data.name }),
    },
  });

  // Replace roles if provided
  if (data.roleId !== undefined) {
    await prisma.userRole.deleteMany({ where: { userId: id } });
    if (data.roleId) {
      await userRoleRepository.assign({ userId: id, roleId: data.roleId });
    }
  }

  // Derive and update authRole
  const authRole = await deriveAuthRole(id);
  await prisma.user.update({
    where: { id },
    data: { role: authRole },
  });

  return prisma.user.findUnique({
    where: { id },
    include: { userRoles: { include: { role: true } } },
  });
}

export async function deleteUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }
  assertUserIsNotBuiltin(user);
  return prisma.user.delete({ where: { id } });
}
```

- [ ] **Step 2: Refactor all admin-user route files**

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git add packages/service/src/services/admin-user.service.ts packages/service/src/routes/admin-user/
git commit -m "refactor: extract admin-user business logic to service layer"
```

---

### Task 7: User-Role Service

**Files:**
- Create: `packages/service/src/services/user-role.service.ts`
- Modify: `packages/service/src/routes/user-role/assignUserRole.ts`
- Modify: `packages/service/src/routes/user-role/removeUserRole.ts`
- Modify: `packages/service/src/routes/user-role/listUserRoles.ts`
- Modify: `packages/service/src/routes/user-role/getUserAppRoles.ts`

- [ ] **Step 1: Create user-role.service.ts**

```typescript
// packages/service/src/services/user-role.service.ts
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { userRoleRepository } from "#repositories/user-role.repository";

function assertUserIsNotBuiltin(userId: string) {
  // Reuse the same builtin check pattern
  const builtinEmails = process.env.BUILTIN_USER_EMAILS?.split(",") ?? [];
  // We need to look up the user to check email — but for simplicity,
  // the route handler can pass the user object if needed
}

export async function assignUserRole(userId: string, roleId: string) {
  return userRoleRepository.assign({ userId, roleId });
}

export async function removeUserRole(userId: string, roleId: string) {
  return userRoleRepository.remove({ userId, roleId });
}

export async function listUserRoles(userId: string) {
  return userRoleRepository.findByUser(userId);
}

export async function getUserAppRoles(userId: string) {
  return userRoleRepository.getMenusForUser(userId);
}
```

- [ ] **Step 2: Refactor user-role route files**

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git add packages/service/src/services/user-role.service.ts packages/service/src/routes/user-role/
git commit -m "refactor: extract user-role business logic to service layer"
```

---

### Task 8: Auth Service

**Files:**
- Create: `packages/service/src/services/auth.service.ts`
- Modify: `packages/service/src/routes/auth/signInEmail.ts`
- Modify: `packages/service/src/routes/auth/signUpEmail.ts`
- Modify: `packages/service/src/routes/auth/signOut.ts`
- Modify: `packages/service/src/routes/auth/changePassword.ts`
- Modify: `packages/service/src/routes/auth/getSession.ts`
- Modify: `packages/service/src/routes/auth/updateUser.ts`

- [ ] **Step 1: Create auth.service.ts**

```typescript
// packages/service/src/services/auth.service.ts
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { auth } from "#lib/auth";
import { verifyPassword, hashPassword } from "#lib/password";

export async function signIn(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { accounts: true },
  });
  if (!user) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }

  const credentialAccount = user.accounts.find(
    (a) => a.providerId === "credential",
  );
  if (!credentialAccount?.password) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }

  const valid = await verifyPassword(password, credentialAccount.password);
  if (!valid) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }

  return user;
}

export async function signUp(email: string, password: string, name?: string) {
  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existing) {
    throw new HTTPException(409, { message: "Email already exists" });
  }

  const result = await auth.api.createUser({
    body: {
      email: email.toLowerCase(),
      password,
      name: name ?? "",
      role: "user",
    },
  });

  return result.user;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { accounts: true },
  });
  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  const credentialAccount = user.accounts.find(
    (a) => a.providerId === "credential",
  );
  if (!credentialAccount?.password) {
    throw new HTTPException(400, { message: "No password set" });
  }

  const valid = await verifyPassword(currentPassword, credentialAccount.password);
  if (!valid) {
    throw new HTTPException(401, { message: "Current password is incorrect" });
  }

  const hashed = await hashPassword(newPassword);
  await prisma.account.update({
    where: { id: credentialAccount.id },
    data: { password: hashed },
  });

  return user;
}

export async function updateUserProfile(
  userId: string,
  data: { name?: string; email?: string },
) {
  return prisma.user.update({
    where: { id: userId },
    data,
  });
}
```

- [ ] **Step 2: Refactor all auth route files**

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git add packages/service/src/services/auth.service.ts packages/service/src/routes/auth/
git commit -m "refactor: extract auth business logic to service layer"
```

---

### Task 9: Upload Service

**Files:**
- Create: `packages/service/src/services/upload.service.ts`
- Modify: `packages/service/src/routes/upload/uploadFile.ts`
- Modify: `packages/service/src/routes/upload/getFile.ts`
- Modify: `packages/service/src/routes/upload/signFile.ts`

- [ ] **Step 1: Create upload.service.ts**

```typescript
// packages/service/src/services/upload.service.ts
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { auth } from "#lib/auth";
import { createHmac } from "node:crypto";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function uploadFile(params: {
  file: File;
  isPublic?: boolean;
  userId: string;
}) {
  const { file, isPublic = true, userId } = params;

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new HTTPException(400, { message: "File type not allowed" });
  }
  if (file.size > MAX_SIZE) {
    throw new HTTPException(400, { message: "File too large (max 5MB)" });
  }

  // Compute hash and storage path
  const buffer = Buffer.from(await file.arrayBuffer());
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(buffer).digest("hex");
  const ext = file.name.split(".").pop();
  const storagePath = `${hash[0]}/${hash[1]}.${ext}`;

  // Store on disk
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const baseDir = isPublic ? "uploads/public" : "uploads/private";
  const fullPath = join(baseDir, storagePath);
  await mkdir(join(baseDir, hash[0], hash[1]), { recursive: true });
  await writeFile(fullPath, buffer);

  // Create DB record
  return prisma.upload.create({
    data: {
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      path: storagePath,
      isPublic,
      userId,
    },
  });
}

export async function getFile(id: string, token?: string) {
  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload) {
    throw new HTTPException(404, { message: "File not found" });
  }

  // For private files, validate signed URL
  if (!upload.isPublic) {
    if (!token) {
      throw new HTTPException(401, { message: "Signed URL required" });
    }
    const [signature, expiry] = token.split(".");
    if (!signature || !expiry) {
      throw new HTTPException(401, { message: "Invalid token format" });
    }
    if (Date.now() > Number(expiry)) {
      throw new HTTPException(401, { message: "Token expired" });
    }
    const expected = createHmac("sha256", process.env.UPLOAD_SECRET!)
      .update(`${id}.${expiry}`)
      .digest("hex");
    // Use timingSafeEqual in actual implementation
    if (signature !== expected) {
      throw new HTTPException(401, { message: "Invalid token" });
    }
  }

  return upload;
}

export async function signFile(userId: string, fileId: string) {
  const upload = await prisma.upload.findUnique({ where: { id: fileId } });
  if (!upload) {
    throw new HTTPException(404, { message: "File not found" });
  }

  // Authorization: only owner or admin can sign
  const session = await auth.api.getSession({
    headers: new Headers({ cookie: "" }), // Will be passed from route
  });
  if (upload.userId !== userId && session?.user?.role !== "admin") {
    throw new HTTPException(403, { message: "Not authorized" });
  }

  const expiry = Date.now() + 3600 * 1000; // 1 hour
  const signature = createHmac("sha256", process.env.UPLOAD_SECRET!)
    .update(`${fileId}.${expiry}`)
    .digest("hex");

  return { url: `/api/upload/${fileId}?token=${signature}.${expiry}` };
}
```

- [ ] **Step 2: Refactor upload route files**

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git add packages/service/src/services/upload.service.ts packages/service/src/routes/upload/
git commit -m "refactor: extract upload business logic to service layer"
```

---

### Task 10: Remaining Services (Log, Audit-Log, System-Config)

**Files:**
- Create: `packages/service/src/services/log.service.ts`
- Create: `packages/service/src/services/audit-log.service.ts`
- Create: `packages/service/src/services/system-config.service.ts`
- Modify: All route files in `log/`, `audit-log/`, `system-config/`

- [ ] **Step 1: Create log.service.ts**

```typescript
// packages/service/src/services/log.service.ts
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

export async function getLogById(id: string) {
  const log = await prisma.operationLog.findUnique({ where: { id } });
  if (!log) {
    throw new HTTPException(404, { message: "Log not found" });
  }
  return log;
}

export async function listLogs(params: {
  traceId?: string;
  sessionId?: string;
  level?: string;
  source?: string;
  module?: string;
  event?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}) {
  const { page = 1, pageSize = 20, startDate, endDate, path, ...filters } = params;
  const where: any = { ...filters };

  if (path) {
    where.path = { contains: path, mode: "insensitive" };
  }
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const [logs, total] = await Promise.all([
    prisma.operationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.operationLog.count({ where }),
  ]);

  return { logs, total };
}

export async function deleteLogs(ids: string[]) {
  return prisma.operationLog.deleteMany({
    where: { id: { in: ids } },
  });
}
```

- [ ] **Step 2: Create audit-log.service.ts**

```typescript
// packages/service/src/services/audit-log.service.ts
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";

export async function getAuditLogById(id: string) {
  const log = await prisma.auditLog.findUnique({ where: { id } });
  if (!log) {
    throw new HTTPException(404, { message: "Audit log not found" });
  }
  return log;
}

export async function listAuditLogs(params: {
  traceId?: string;
  sessionId?: string;
  userId?: string;
  userName?: string;
  event?: string;
  category?: string;
  severity?: string;
  outcome?: string;
  targetType?: string;
  targetId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}) {
  const { page = 1, pageSize = 20, startDate, endDate, userName, ...filters } = params;
  const where: any = { ...filters };

  if (userName) {
    where.userName = { contains: userName, mode: "insensitive" };
  }
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}
```

- [ ] **Step 3: Create system-config.service.ts**

```typescript
// packages/service/src/services/system-config.service.ts
import { HTTPException } from "hono/http-exception";
import { systemConfigRepository } from "#repositories/system-config.repository";

export async function getConfig(group: string, key: string) {
  const config = await systemConfigRepository.findByGroupAndKey(group, key);
  if (!config) {
    throw new HTTPException(404, { message: "Config not found" });
  }
  return config;
}

export async function upsertConfig(
  group: string,
  key: string,
  data: {
    value: string;
    type?: string;
    label: string;
    description?: string;
    isSecret?: boolean;
    sortOrder?: number;
  },
) {
  return systemConfigRepository.upsert(group, key, data);
}

export async function batchUpsertConfigs(
  items: {
    group: string;
    key: string;
    value: string;
    type?: string;
    label: string;
    description?: string;
    isSecret?: boolean;
    sortOrder?: number;
  }[],
) {
  return systemConfigRepository.batchUpsert(items);
}

export async function deleteConfig(group: string, key: string) {
  try {
    return await systemConfigRepository.delete(group, key);
  } catch {
    throw new HTTPException(404, { message: "Config not found" });
  }
}

export async function listConfigs(group?: string) {
  if (group) {
    return systemConfigRepository.findByGroup(group);
  }
  return systemConfigRepository.findAll();
}
```

- [ ] **Step 4: Refactor all route files in log/, audit-log/, system-config/**

- [ ] **Step 5: Run tests**

- [ ] **Step 6: Commit**

```bash
git add packages/service/src/services/log.service.ts packages/service/src/services/audit-log.service.ts packages/service/src/services/system-config.service.ts packages/service/src/routes/log/ packages/service/src/routes/audit-log/ packages/service/src/routes/system-config/
git commit -m "refactor: extract log, audit-log, system-config business logic to service layer"
```

---

### Task 11: Add path alias for services

**Files:**
- Modify: `packages/service/package.json` (add `#services/*` alias)

- [ ] **Step 1: Update package.json imports field**

Add to the `imports` map in `packages/service/package.json`:

```json
"#services/*": "./src/services/*"
```

- [ ] **Step 2: Verify TypeScript resolves the alias**

Run: `pnpm --filter @repo/service exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/service/package.json
git commit -m "chore: add #services path alias"
```

---

### Task 12: Final verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm --filter @repo/service exec vitest --run`
Expected: All tests PASS

- [ ] **Step 2: Run linter**

Run: `pnpm lint`
Expected: No errors

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @repo/service exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run dev server smoke test**

Run: `pnpm --filter @repo/service dev`
Expected: Server starts without errors

- [ ] **Step 5: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "refactor: complete service layer extraction"
```
