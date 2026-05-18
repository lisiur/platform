# Role Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add role management functionality to the admin panel using better-auth's built-in role system with custom permissions for admin, manager, and user roles.

**Architecture:** Extend better-auth's admin plugin with custom access control, create a role management page to display roles and permissions, and enhance the user management interface with role assignment capabilities.

**Tech Stack:** Next.js 16, better-auth, React 19, Tailwind 4, shadcn/ui, TypeScript

---

## File Structure

### Files to Create/Modify

**Backend (packages/service):**
- `packages/service/src/lib/auth.ts` - Add custom access control and roles
- `packages/service/src/lib/permissions.ts` - New file for permission definitions

**Frontend (apps/admin):**
- `apps/admin/src/lib/api/auth-client.ts` - Update client with roles
- `apps/admin/src/app/(logged)/roles/page.tsx` - New role management page
- `apps/admin/src/app/(logged)/roles/components/role-table.tsx` - Role list component
- `apps/admin/src/app/(logged)/roles/components/role-detail-dialog.tsx` - Role detail dialog
- `apps/admin/src/app/(logged)/users/components/user-table.tsx` - Add role column
- `apps/admin/src/app/(logged)/users/components/user-dialog.tsx` - Add role selection
- `apps/admin/src/messages/en.json` - Add role translations
- `apps/admin/src/messages/zh.json` - Add role translations
- `apps/admin/src/components/layout/sidebar.tsx` - Add roles menu item

---

## Task 1: Create Permission Definitions

**Files:**
- Create: `packages/service/src/lib/permissions.ts`

- [ ] **Step 1: Create permissions file with role definitions**

```typescript
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

export const statement = {
  ...defaultStatements,
  project: ["create", "read", "update", "delete"],
  config: ["read", "update"],
} as const;

export const ac = createAccessControl(statement);

export const admin = ac.newRole({
  ...adminAc.statements,
  project: ["create", "read", "update", "delete"],
  config: ["read", "update"],
});

export const manager = ac.newRole({
  user: ["list", "set-role"],
  session: ["list"],
  project: ["create", "read", "update"],
  config: ["read"],
});

export const user = ac.newRole({
  user: [],
  session: [],
  project: ["read"],
  config: ["read"],
});
```

- [ ] **Step 2: Verify file structure**

Run: `cat packages/service/src/lib/permissions.ts`
Expected: File exists with proper TypeScript syntax

- [ ] **Step 3: Commit**

```bash
git add packages/service/src/lib/permissions.ts
git commit -m "feat: add permission definitions for admin, manager, and user roles"
```

---

## Task 2: Update Auth Configuration

**Files:**
- Modify: `packages/service/src/lib/auth.ts:1-28`

- [ ] **Step 1: Import permissions and update auth config**

```typescript
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, openAPI, organization } from "better-auth/plugins";
import { prisma } from "./db";
import { ac, admin, manager, user } from "./permissions";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 1,
  },
  socialProviders: {
    wechat: {
      enabled: !!process.env.WECHAT_CLIENT_ID,
      clientId: process.env.WECHAT_CLIENT_ID ?? "",
      clientSecret: process.env.WECHAT_CLIENT_SECRET ?? "",
      lang: "cn",
    },
  },
  plugins: [
    openAPI(),
    admin({
      ac,
      roles: {
        admin,
        manager,
        user,
      },
    }),
    organization(),
  ],
});

export type AuthType = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `pnpm --filter @repo/service typecheck`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add packages/service/src/lib/auth.ts
git commit -m "feat: configure custom roles and permissions in auth"
```

---

## Task 3: Update Client Configuration

**Files:**
- Modify: `apps/admin/src/lib/api/auth-client.ts:1-17`

- [ ] **Step 1: Import roles and update client config**

```typescript
"use client";

import { createAuthClient } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";
import { toast } from "sonner";
import { ac, admin, manager, user } from "@repo/service/lib/permissions";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    adminClient({
      ac,
      roles: {
        admin,
        manager,
        user,
      },
    }),
  ],
  fetchOptions: {
    onError: async (ctx) => {
      const error = await ctx.response?.json().catch(() => null);
      const message = error?.message ?? ctx.error?.message ?? "Request failed";
      toast.error(message);
    },
  },
});
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `pnpm --filter @repo/admin typecheck`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/lib/api/auth-client.ts
git commit -m "feat: update client with custom roles and permissions"
```

---

## Task 4: Add Translations

**Files:**
- Modify: `apps/admin/src/messages/en.json`
- Modify: `apps/admin/src/messages/zh.json`

- [ ] **Step 1: Add English translations**

```json
{
  "Roles": {
    "title": "Role Management",
    "description": "Manage system roles and permissions",
    "name": "Role Name",
    "description_label": "Description",
    "permissions": "Permissions",
    "userCount": "Users",
    "actions": "Actions",
    "viewDetails": "View Details",
    "admin": "Administrator",
    "admin_desc": "Full system access with all permissions",
    "manager": "Manager",
    "manager_desc": "Can manage users and view most resources",
    "user": "User",
    "user_desc": "Basic access with limited permissions",
    "resource": "Resource",
    "action": "Action",
    "granted": "Granted",
    "denied": "Denied"
  }
}
```

- [ ] **Step 2: Add Chinese translations**

```json
{
  "Roles": {
    "title": "角色管理",
    "description": "管理系统角色和权限",
    "name": "角色名称",
    "description_label": "描述",
    "permissions": "权限",
    "userCount": "用户数",
    "actions": "操作",
    "viewDetails": "查看详情",
    "admin": "管理员",
    "admin_desc": "拥有系统所有权限",
    "manager": "经理",
    "manager_desc": "可以管理用户和查看大部分资源",
    "user": "普通用户",
    "user_desc": "基础访问权限",
    "resource": "资源",
    "action": "操作",
    "granted": "已授权",
    "denied": "未授权"
  }
}
```

- [ ] **Step 3: Verify translations are loaded**

Run: `pnpm --filter @repo/admin dev`
Expected: Application starts without errors

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/messages/en.json apps/admin/src/messages/zh.json
git commit -m "feat: add role management translations"
```

---

## Task 5: Create Role Table Component

**Files:**
- Create: `apps/admin/src/app/(logged)/roles/components/role-table.tsx`

- [ ] **Step 1: Create role table component**

```tsx
"use client";

import type { Role } from "@repo/service/lib/permissions";
import { Eye, Shield, ShieldCheck, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RoleDetailDialog } from "./role-detail-dialog";

interface RoleInfo {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  permissions: Record<string, string[]>;
}

const roles: RoleInfo[] = [
  {
    id: "admin",
    name: "Roles.admin",
    description: "Roles.admin_desc",
    icon: <ShieldCheck className="h-4 w-4" />,
    permissions: {
      user: ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password"],
      session: ["list", "revoke", "delete"],
      project: ["create", "read", "update", "delete"],
      config: ["read", "update"],
    },
  },
  {
    id: "manager",
    name: "Roles.manager",
    description: "Roles.manager_desc",
    icon: <Shield className="h-4 w-4" />,
    permissions: {
      user: ["list", "set-role"],
      session: ["list"],
      project: ["create", "read", "update"],
      config: ["read"],
    },
  },
  {
    id: "user",
    name: "Roles.user",
    description: "Roles.user_desc",
    icon: <User className="h-4 w-4" />,
    permissions: {
      user: [],
      session: [],
      project: ["read"],
      config: ["read"],
    },
  },
];

export function RoleTable() {
  const t = useTranslations("Roles");
  const [selectedRole, setSelectedRole] = React.useState<RoleInfo | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("description_label")}</TableHead>
            <TableHead>{t("permissions")}</TableHead>
            <TableHead className="text-right">{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {role.icon}
                  <span className="font-medium">{t(role.name)}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t(role.description)}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(role.permissions).map(([resource, actions]) =>
                    actions.length > 0 ? (
                      <Badge key={resource} variant="secondary" className="text-xs">
                        {resource}: {actions.length}
                      </Badge>
                    ) : null
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedRole(role)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedRole && (
        <RoleDetailDialog
          role={selectedRole}
          open={!!selectedRole}
          onOpenChange={(open) => !open && setSelectedRole(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `pnpm --filter @repo/admin typecheck`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/\(logged\)/roles/components/role-table.tsx
git commit -m "feat: create role table component"
```

---

## Task 6: Create Role Detail Dialog

**Files:**
- Create: `apps/admin/src/app/(logged)/roles/components/role-detail-dialog.tsx`

- [ ] **Step 1: Create role detail dialog component**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RoleInfo {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  permissions: Record<string, string[]>;
}

interface RoleDetailDialogProps {
  role: RoleInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoleDetailDialog({
  role,
  open,
  onOpenChange,
}: RoleDetailDialogProps) {
  const t = useTranslations("Roles");

  const allActions = ["create", "read", "update", "delete", "list", "set-role", "ban", "impersonate", "set-password", "revoke"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {role.icon}
            {t(role.name)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-muted-foreground">{t(role.description)}</p>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("resource")}</TableHead>
                {allActions.map((action) => (
                  <TableHead key={action} className="text-center">
                    {action}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(role.permissions).map(([resource, actions]) => (
                <TableRow key={resource}>
                  <TableCell className="font-medium">{resource}</TableCell>
                  {allActions.map((action) => (
                    <TableCell key={action} className="text-center">
                      {actions.includes(action) ? (
                        <Badge variant="default" className="text-xs">
                          {t("granted")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          {t("denied")}
                        </Badge>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `pnpm --filter @repo/admin typecheck`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/\(logged\)/roles/components/role-detail-dialog.tsx
git commit -m "feat: create role detail dialog component"
```

---

## Task 7: Create Role Management Page

**Files:**
- Create: `apps/admin/src/app/(logged)/roles/page.tsx`

- [ ] **Step 1: Create role management page**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { RoleTable } from "./components/role-table";

export default function RolesPage() {
  const t = useTranslations("Roles");

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <RoleTable />
    </div>
  );
}
```

- [ ] **Step 2: Verify page is accessible**

Run: `pnpm --filter @repo/admin dev`
Expected: Navigate to `/roles` shows the page

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/\(logged\)/roles/page.tsx
git commit -m "feat: create role management page"
```

---

## Task 8: Update User Table with Role Column

**Files:**
- Modify: `apps/admin/src/app/(logged)/users/components/user-table.tsx:109-125`

- [ ] **Step 1: Add role column to user table**

```tsx
// In the TableHeader, add after the role column
<TableHead>{t("role")}</TableHead>

// In the TableBody, update the role cell
<TableCell>
  <Badge
    variant={
      user.role === "admin"
        ? "default"
        : user.role === "manager"
        ? "secondary"
        : "outline"
    }
  >
    {user.role ?? "user"}
  </Badge>
</TableCell>
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `pnpm --filter @repo/admin typecheck`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/\(logged\)/users/components/user-table.tsx
git commit -m "feat: add role column to user table"
```

---

## Task 9: Update User Dialog with Role Selection

**Files:**
- Modify: `apps/admin/src/app/(logged)/users/components/user-dialog.tsx`

- [ ] **Step 1: Add role selection to user dialog**

```tsx
// Add role field to the form
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// In the form, add role selection
<div className="space-y-2">
  <Label htmlFor="role">{t("role")}</Label>
  <Select
    value={formData.role}
    onValueChange={(value) =>
      setFormData((prev) => ({ ...prev, role: value }))
    }
  >
    <SelectTrigger>
      <SelectValue placeholder={t("selectRole")} />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="admin">{t("admin")}</SelectItem>
      <SelectItem value="manager">{t("manager")}</SelectItem>
      <SelectItem value="user">{t("user")}</SelectItem>
    </SelectContent>
  </Select>
</div>

// Update form state to include role
const [formData, setFormData] = useState({
  name: user?.name ?? "",
  email: user?.email ?? "",
  password: "",
  role: user?.role ?? "user",
});
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `pnpm --filter @repo/admin typecheck`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/\(logged\)/users/components/user-dialog.tsx
git commit -m "feat: add role selection to user dialog"
```

---

## Task 10: Add Roles Menu Item to Sidebar

**Files:**
- Modify: `apps/admin/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add roles menu item**

```tsx
import { Shield } from "lucide-react";

// In the menu items array, add:
{
  title: t("roles"),
  href: "/roles",
  icon: Shield,
},
```

- [ ] **Step 2: Verify sidebar shows new item**

Run: `pnpm --filter @repo/admin dev`
Expected: Sidebar shows "Roles" menu item

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/layout/sidebar.tsx
git commit -m "feat: add roles menu item to sidebar"
```

---

## Task 11: Test Role Management Functionality

**Files:**
- None (manual testing)

- [ ] **Step 1: Start development servers**

Run: `pnpm dev`
Expected: Both web (3000) and service (3001) servers start

- [ ] **Step 2: Test role management page**

1. Navigate to `/roles`
2. Verify all three roles are displayed
3. Click eye icon to view role details
4. Verify permissions table shows correct data

- [ ] **Step 3: Test user role assignment**

1. Navigate to `/users`
2. Click edit on a user
3. Change role using dropdown
4. Save and verify role is updated

- [ ] **Step 4: Test permission enforcement**

1. Login as manager role
2. Verify can access user list but not all admin features
3. Login as user role
4. Verify limited access

- [ ] **Step 5: Commit (if any fixes needed)**

```bash
git add .
git commit -m "fix: role management testing fixes"
```

---

## Task 12: Final Verification

**Files:**
- None

- [ ] **Step 1: Run type checks**

Run: `pnpm typecheck`
Expected: No TypeScript errors

- [ ] **Step 2: Run linter**

Run: `pnpm lint`
Expected: No linting errors

- [ ] **Step 3: Build production**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Document completion**

```bash
git add .
git commit -m "feat: complete role management implementation"
```

---

## Summary

This plan implements role management functionality using better-auth's built-in role system with custom permissions for admin, manager, and user roles. The implementation includes:

1. Custom permission definitions with role-based access control
2. Role management page with role list and detail views
3. Enhanced user management with role assignment
4. Sidebar navigation update
5. Internationalization support

**Estimated completion time:** 2-3 hours
**Dependencies:** better-auth, shadcn/ui components, next-intl
