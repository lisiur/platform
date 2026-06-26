<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Image Handling

- Always use `next/image` (`<Image />`) instead of the native HTML `<img>` tag.
- Import: `import Image from "next/image"`
- Use `unoptimized` prop for data URLs or external images without a configured image domain.
- Use `fill` with a parent container or explicit `width`/`height` props.

# Form Handling

- Inside `<form>`, wrap form controls with the shared Field primitives from `@repo/ui`.
- Use `FieldGroup` to group related fields, `Field` for each form item, `FieldLabel` instead of raw `<label>` or `Label`, `FieldError` for validation messages, and `FieldDescription` for helper text.
- Do not add new raw label/error wrapper markup inside forms unless there is a specific component-level reason.

# Table Handling

- For any table with an operation/action column, fix that column to the right side of the horizontally scrollable table.
- Apply the fixed-right behavior to both the header and body cells, for example: `className="sticky right-0 bg-background text-right shadow-[-1px_0_0_0_var(--border)]"`.
- Do not treat data fields named `action` as operation columns unless they contain row-level action controls such as edit, delete, view, configure, or permission buttons.

# Page Layout

- Use `ManagementPageShell` for all management pages. It provides consistent layout with `container mx-auto py-8`, title, description, and proper flex container structure.
- Pattern: `<ManagementPageShell title={t("title")} description={t("description")}>{children}</ManagementPageShell>`

# Dialog Pattern

- Use `DialogBody` to wrap form content in dialogs — it provides the correct padding.
- Structure: `DialogHeader` (title + description) → `DialogBody` (form) → `DialogFooter` (buttons).
- Place the submit button in `DialogFooter` with `form="form-id"` attribute, not inside the `<form>`.
- Reset form state in `handleOpenChange` when closing.

# Service Layer

- Routes should only handle: session extraction, permission checks, input validation, service calls, audit logging, and response formatting.
- Business logic, database operations, and validation rules belong in service files under `packages/service/src/services/`.
- Services throw `HTTPException` for errors (404, 409, 400, etc.).

# Seed & Menus

- When adding a new page, add a corresponding menu entry in `packages/service/prisma/seed.ts` under `organizationMenus`.
- Menu entries require: `id`, `code`, `name`, `icon`, `linkType: "INTERNAL"`, `url`, `sortOrder`, and `permissions`.
- Run `pnpm db:seed` after menu changes.

# Translations

- All user-facing strings must use `useTranslations("Namespace")` hook.
- Add translation keys to both `apps/organization/messages/en.json` and `zh.json`.
- Use descriptive key names like `createDescription`, `editDepartment`, `updateSuccess`.
