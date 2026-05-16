# Organization Management (Admin)

## Context

The Prisma schema already defines `Organization`, `Member`, and `Invitation` models, and better-auth's `organization()` plugin is configured on the server. However, there is no UI or API for managing organizations. This feature adds a full admin management page for organizations.

better-auth's built-in organization endpoints are membership-scoped (users only see orgs they belong to). Since the requirement is **full system admin** (admin can see ALL orgs regardless of membership), we use custom Hono routes with direct Prisma queries.

## Backend API Routes

New route group at `packages/service/src/routes/organization/`:

```
packages/service/src/routes/organization/
├── index.ts              ← OpenAPIHono + admin middleware + route registration
├── schema.ts             ← Zod schemas (list query, create/update body)
├── listOrganizations.ts  ← GET /api/organizations (paginated)
├── getOrganization.ts    ← GET /api/organizations/:id
├── createOrganization.ts ← POST /api/organizations
├── updateOrganization.ts ← PUT /api/organizations/:id
└── deleteOrganization.ts ← DELETE /api/organizations/:id
```

### Middleware

Same pattern as `system-config` — require `session.user.role === "admin"`.

### Endpoints

| Method | Path | Description | Request | Response |
|--------|------|-------------|---------|----------|
| GET | `/api/organizations` | List all orgs (paginated) | Query: `limit`, `offset` | `{ organizations, total }` |
| GET | `/api/organizations/:id` | Get org by ID | Params: `id` | Organization object |
| POST | `/api/organizations` | Create org | Body: `name`, `slug`, `logo?`, `metadata?` | Organization object |
| PUT | `/api/organizations/:id` | Update org | Params: `id`, Body: partial fields | Organization object |
| DELETE | `/api/organizations/:id` | Delete org | Params: `id` | `{ success: true }` |

### Schema Fields

- `name` (string, required) — Organization display name
- `slug` (string, required, unique) — URL-friendly identifier
- `logo` (string, optional) — Logo URL
- `metadata` (JSON, optional) — Arbitrary key-value data
- `createdAt`, `updatedAt` — Auto-managed timestamps

## Frontend Pages & Components

New page at `apps/admin/src/app/(logged)/organizations/`:

```
organizations/
├── page.tsx                          ← Page wrapper (title + description)
└── components/
    ├── organization-table.tsx        ← Table with pagination, edit/delete buttons
    ├── organization-dialog.tsx       ← Create/edit dialog (react-hook-form + zod)
    └── delete-confirm-dialog.tsx     ← Delete confirmation dialog
```

### Organization Table

Columns: Name, Slug, Logo (thumbnail), Created At, Actions (edit/delete).
Same pagination pattern as users page (10 per page, prev/next buttons).

### Create/Edit Dialog

Fields:
- `name` — text input, required
- `slug` — text input, required, auto-generated from name on create
- `logo` — URL input, optional
- `metadata` — JSON textarea, optional

Uses `react-hook-form` + `zod` for validation, matching the existing `UserDialog` pattern.

### Delete Confirmation

Same pattern as `DeleteConfirmDialog` in users — shows org name, confirm/cancel buttons.

### Sidebar

Add "Organizations" menu item with `Building2` icon in `sidebar.tsx`, between "Users" and the bottom section.

## i18n

Add `Organizations` section to both `en.json` and `zh.json` under `apps/admin/messages/`.

## Files to Create/Modify

### Create
- `packages/service/src/routes/organization/schema.ts`
- `packages/service/src/routes/organization/listOrganizations.ts`
- `packages/service/src/routes/organization/getOrganization.ts`
- `packages/service/src/routes/organization/createOrganization.ts`
- `packages/service/src/routes/organization/updateOrganization.ts`
- `packages/service/src/routes/organization/deleteOrganization.ts`
- `packages/service/src/routes/organization/index.ts`
- `apps/admin/src/app/(logged)/organizations/page.tsx`
- `apps/admin/src/app/(logged)/organizations/components/organization-table.tsx`
- `apps/admin/src/app/(logged)/organizations/components/organization-dialog.tsx`
- `apps/admin/src/app/(logged)/organizations/components/delete-confirm-dialog.tsx`

### Modify
- `packages/service/src/routes/index.ts` — mount organization routes
- `apps/admin/src/components/layout/sidebar.tsx` — add menu item
- `apps/admin/messages/en.json` — add translations
- `apps/admin/messages/zh.json` — add translations
