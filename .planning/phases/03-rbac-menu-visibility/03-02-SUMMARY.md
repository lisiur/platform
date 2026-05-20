---
phase: 03-rbac-menu-visibility
plan: 02
subsystem: ui
tags: [react, next-intl, checkbox-tree, role-menu-assignment]

requires:
  - phase: 03-rbac-menu-visibility
    plan: 01
    provides: MenuRole API endpoints (batch assign, get role menus)
provides:
  - Role-menu assignment page at /roles/menus
  - Checkbox tree component with auto-include children
  - i18n strings for RoleMenus section (en, zh)
affects: []

tech-stack:
  added: []
  patterns: [checkbox-tree-with-auto-include, role-selector-dropdown]

key-files:
  created:
    - apps/admin/src/app/(logged)/roles/menus/page.tsx
    - apps/admin/src/app/(logged)/roles/menus/components/role-menu-tree.tsx
  modified:
    - apps/admin/messages/en.json
    - apps/admin/messages/zh.json

key-decisions:
  - "Hardcoded three roles (admin, manager, user) matching existing role-table.tsx"
  - "Reuse buildTree pattern from menu-tree.tsx for consistency"

patterns-established:
  - "Checkbox tree: check parent auto-checks all descendants, uncheck parent auto-unchecks"
  - "Role selector with left-right split layout"

requirements-completed: [RBAC-01]

duration: 5
completed: 2026-05-20
---

# Plan 03-02: Role-Menu Assignment UI Summary

**Admin page with role selector dropdown, checkbox tree showing all menus, auto-include children on check, and save button**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-20T09:10:00Z
- **Completed:** 2026-05-20T09:15:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Checkbox tree component with auto-include children logic
- Role-menu assignment page with role selector and save functionality
- i18n strings for RoleMenus section in English and Chinese

## Task Commits

Each task was committed atomically:

1. **Task 1: Create checkbox tree component and i18n strings** - `8710e79` (feat)
2. **Task 2: Create role-menu assignment page** - `8710e79` (feat)

**Plan metadata:** `8710e79` (feat: complete plan)

## Files Created/Modified
- `apps/admin/src/app/(logged)/roles/menus/page.tsx` - Role-menu assignment page with role selector
- `apps/admin/src/app/(logged)/roles/menus/components/role-menu-tree.tsx` - Checkbox tree component
- `apps/admin/messages/en.json` - Added RoleMenus i18n keys
- `apps/admin/messages/zh.json` - Added RoleMenus i18n keys

## Decisions Made
- Hardcoded three roles (admin, manager, user) matching existing role-table.tsx
- Reuse buildTree pattern from menu-tree.tsx for consistency
- Left-right split layout: role selector on left (1/3), menu tree on right (2/3)

## Deviations from Plan

None - plan executed exactly as written

## Issues Encountered
None

## Self-Check: PASSED

Verified:
- [x] RoleMenuTree exports checkbox tree component
- [x] Checking parent adds all descendants to checkedIds
- [x] Unchecking parent removes all descendants
- [x] getIcon() resolves icon strings to Lucide components
- [x] buildTree() converts flat Menu[] to nested TreeNode[]
- [x] en.json contains RoleMenus key with all required sub-keys
- [x] zh.json contains RoleMenus key with all required sub-keys
- [x] Page renders at /roles/menus with role selector and save button

---
*Phase: 03-rbac-menu-visibility*
*Completed: 2026-05-20*
