---
phase: 03-rbac-menu-visibility
plan: 03
subsystem: ui
tags: [react, zustand, sidebar, dynamic-menu]

requires:
  - phase: 03-rbac-menu-visibility
    plan: 01
    provides: GET /menus/mine endpoint for role-filtered menus
provides:
  - Zustand store caching user's authorized menus
  - Dynamic sidebar rendering menus from database
  - Loading and empty states for sidebar
  - i18n strings for sidebar loading states
affects: []

tech-stack:
  added: []
  patterns: [zustand-menu-cache, dynamic-sidebar-tree]

key-files:
  created:
    - apps/admin/src/stores/menu-store.ts
  modified:
    - apps/admin/src/components/layout/sidebar.tsx
    - apps/admin/messages/en.json
    - apps/admin/messages/zh.json

key-decisions:
  - "Menus fetched once on login and cached in Zustand store"
  - "Icon resolution happens in sidebar component using lucide-react iconsRecord"
  - "bottomMenuItems (profile, settings) remain hardcoded below dynamic section"

patterns-established:
  - "Zustand store with fetched flag to prevent re-fetching"
  - "Recursive SidebarMenuNode component for tree rendering"

requirements-completed: [RBAC-02]

duration: 5
completed: 2026-05-20
---

# Plan 03-03: Dynamic Sidebar Summary

**Zustand store caching user's authorized menus and replacing hardcoded sidebar with dynamic rendering**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-20T09:20:00Z
- **Completed:** 2026-05-20T09:25:00Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments
- Zustand store for caching user's authorized menus
- Dynamic sidebar rendering menus from database instead of hardcoded array
- Loading state with skeleton placeholders
- Empty state when no menus available

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Zustand menu store and update sidebar** - `4324e48` (feat)

**Plan metadata:** `4324e48` (feat: complete plan)

## Files Created/Modified
- `apps/admin/src/stores/menu-store.ts` - Zustand store for menu caching
- `apps/admin/src/components/layout/sidebar.tsx` - Dynamic sidebar with tree rendering
- `apps/admin/messages/en.json` - Added Sidebar loading/empty state keys
- `apps/admin/messages/zh.json` - Added Sidebar loading/empty state keys

## Decisions Made
- Menus fetched once on login via GET /menus/mine and cached in Zustand
- Icon resolution uses lucide-react iconsRecord pattern from menu-tree.tsx
- bottomMenuItems (profile, settings) remain hardcoded in SidebarFooter
- Recursive SidebarMenuNode component for tree rendering with expand/collapse

## Deviations from Plan

None - plan executed exactly as written

## Issues Encountered
None

## Self-Check: PASSED

Verified:
- [x] useMenuStore exports with menus, treeMenus, loading, fetched, fetchMenus, refetchMenus
- [x] useMenuStore.fetchMenus calls appClient.api.menu.mine.$get()
- [x] Sidebar no longer contains hardcoded menuItems array
- [x] Sidebar reads from useMenuStore instead of hardcoded data
- [x] Loading state renders Skeleton components while loading === true
- [x] Empty state renders when fetched === true && treeMenus.length === 0
- [x] Dynamic tree renders with icons resolved from Menu.icon string field
- [x] bottomMenuItems remain hardcoded in SidebarFooter
- [x] en.json Sidebar section contains loading, noMenus, fetchError keys
- [x] zh.json Sidebar section contains matching Chinese keys

---
*Phase: 03-rbac-menu-visibility*
*Completed: 2026-05-20*
