-- ============================================================================
-- ONE-OFF manual migration: system/user-credit:update permission (2026-09-21)
-- ============================================================================
-- Purpose: provision the new admin permission on EXISTING deployments. Fresh
-- databases need nothing — seed.ts already inserts this row on first boot.
--
-- DO NOT move this into prisma/migrations/: on a fresh database the migration
-- would run BEFORE boot-seed and the seed's createPermission would then 409 on
-- the unique code. This file and seed.ts are two views of the same desired
-- rows — if you change one, change the other.
--
-- Backstory: seed() only runs on a fresh database (app.ts checks for the admin
-- application record), so permissions added to systemPermissions later never
-- reach an already-seeded database without this one-off.
--
-- Idempotent: safe to run any number of times (ON CONFLICT DO NOTHING). Wrap
-- in one transaction; takes effect on the next permission check (no service
-- restart needed), though signed-in users may need to re-auth for their
-- session's permission snapshot to refresh.
-- ============================================================================

BEGIN;

-- 1. The permission itself (mirrors seed.ts systemPermissions).
INSERT INTO "permission" ("id", "name", "code", "group", "description", "createdAt", "updatedAt")
VALUES (
  'perm-system-user-credit-update',
  'Update User Credits',
  'system/user-credit:update',
  'user-credit',
  NULL,
  now(),
  now()
)
ON CONFLICT ("code") DO NOTHING;

-- 2. Grant it to the super-admin role (mirrors seed.ts adminRolePermissions:
--    ADMIN_ROLE_CODE gets every systemPermissions code via spread).
INSERT INTO "role_permission" ("id", "roleId", "permissionId", "createdAt")
SELECT
  'rp-perm-system-user-credit-update-admin',
  r."id",
  p."id",
  now()
FROM "role" r
JOIN "permission" p ON p."code" = 'system/user-credit:update'
WHERE r."code" = 'system/admin'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

COMMIT;

-- ============================================================================
-- Verification (run after; every query below should answer):
-- SELECT "code", "name" FROM "permission" WHERE "code" = 'system/user-credit:update';
-- SELECT r."code" AS role, p."code" AS permission
--   FROM "role_permission" rp
--   JOIN "role" r ON r."id" = rp."roleId"
--   JOIN "permission" p ON p."id" = rp."permissionId"
--   WHERE p."code" = 'system/user-credit:update';
-- ============================================================================
