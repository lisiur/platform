import {
  ADMIN_APP_CODE,
  ORGANIZATION_APP_CODE,
  QIANLAI_APP_CODE,
  STUDYBUDDY_APP_CODE,
} from "@repo/shared";

export const SYSTEM_SCOPE = "system";

export const ORG_SCOPE_PREFIX = "org:";

/**
 * Matches a scope prefix: "system" or "org:<organizationId>".
 */
export const SCOPE_PREFIX_REGEX = /^(system|org:[^/\s]+)$/;

/**
 * Matches a well-formed role code: `<scope>/<roleName>` where the scope is
 * "system" or "org:<organizationId>" and the roleName contains no slashes
 * or whitespace.
 *   "system/admin"   ✓
 *   "org:123/owner"  ✓
 *   "editor"         ✗ (no scope prefix)
 *   "system/a/b"     ✗ (roleName contains a slash)
 */
export const ROLE_CODE_REGEX = /^(system|org:[^/\s]+)\/[^/\s]+$/;

/**
 * Scope segment used in permission codes for organization-level permissions
 * (e.g. "org/dashboard:view"). Distinct from {@link ORG_SCOPE_PREFIX} which is
 * the per-instance prefix used in role codes (e.g. "org:123/owner").
 */
export const ORG_PERMISSION_SCOPE = "org";

/**
 * Scope segment used in permission codes for StudyBuddy app permissions
 * (e.g. "studybuddy/dashboard:view"). Independent of both the system and org
 * permission scopes.
 */
export const STUDYBUDDY_PERMISSION_SCOPE = "studybuddy";

/**
 * Scope segment used in permission codes for the Qianlai bookkeeping app
 * (e.g. "qianlai/dashboard:view"). Independent of the other permission scopes.
 */
export const QIANLAI_PERMISSION_SCOPE = "qianlai";

export const orgScope = (organizationId: string): string =>
  `${ORG_SCOPE_PREFIX}${organizationId}`;

export type ScopeContext = { organizationId?: string | null };

export function scopeFromContext(ctx: ScopeContext): string {
  return ctx.organizationId ? orgScope(ctx.organizationId) : SYSTEM_SCOPE;
}

/**
 * Extracts the scope segment from a role code of the form `<scope>/<roleName>`.
 * The scope is everything before the last `/`.
 *   "system/admin"      → "system"
 *   "org:123/owner"     → "org:123"
 */
export function scopeOfRoleCode(code: string): string {
  const idx = code.lastIndexOf("/");
  return idx === -1 ? code : code.slice(0, idx);
}

/** Builds a role code at a given scope: roleCodeAtScope("org:123", "owner") → "org:123/owner". */
export function roleCodeAtScope(scope: string, roleName: string): string {
  return `${scope}/${roleName}`;
}

export type ParsedScope =
  | { kind: "system" }
  | { kind: "org"; id: string }
  | { kind: "unknown"; raw: string };

export function parseScope(scope: string): ParsedScope {
  if (scope === SYSTEM_SCOPE) return { kind: "system" };
  if (scope.startsWith(ORG_SCOPE_PREFIX)) {
    return { kind: "org", id: scope.slice(ORG_SCOPE_PREFIX.length) };
  }
  return { kind: "unknown", raw: scope };
}

/**
 * Prisma where condition matching role codes under a given scope.
 * roleWhereByScope("system")      → { code: { startsWith: "system/" } }
 * roleWhereByScope(orgScope("1")) → { code: { startsWith: "org:1/" } }
 */
export function roleWhereByScope(scope: string) {
  return { code: { startsWith: `${scope}/` } };
}

/**
 * Prisma where condition matching permission codes under a given scope.
 * permissionWhereByScope(SYSTEM_SCOPE)        → { code: { startsWith: "system/" } }
 * permissionWhereByScope(ORG_PERMISSION_SCOPE) → { code: { startsWith: "org/" } }
 */
export function permissionWhereByScope(scope: string) {
  return { code: { startsWith: `${scope}/` } };
}

/**
 * Prisma where condition for RoleAssignment queries, filtering by the scope of
 * the related role's code.
 * roleAssignmentWhereByRoleScope("system") → { role: { code: { startsWith: "system/" } } }
 */
export function roleAssignmentWhereByRoleScope(scope: string) {
  return { role: roleWhereByScope(scope) };
}

/**
 * Maps a role code to the permission scopes that role may hold. Org roles are
 * per-instance ("org:123/owner") but org permissions share a single "org"
 * scope, so the permission scope differs from the role scope. System roles may
 * additionally hold the independent "studybuddy" and "qianlai" scopes.
 *   "system/admin"   → ["system", "studybuddy", "qianlai"]
 *   "org:123/owner"  → ["org"]
 */
export function permissionScopesForRoleCode(roleCode: string): string[] {
  const parsed = parseScope(scopeOfRoleCode(roleCode));
  if (parsed.kind === "system")
    return [
      SYSTEM_SCOPE,
      STUDYBUDDY_PERMISSION_SCOPE,
      QIANLAI_PERMISSION_SCOPE,
    ];
  if (parsed.kind === "org") return [ORG_PERMISSION_SCOPE];
  return [scopeOfRoleCode(roleCode)];
}

/**
 * Maps an application code to the scope of the permissions its menus may use.
 *   "admin"        → "system"
 *   "organization" → "org"
 *   "studybuddy"   → "studybuddy"
 *   "qianlai"      → "qianlai"
 */
export function permissionScopeForAppCode(appCode: string): string {
  if (appCode === ADMIN_APP_CODE) return SYSTEM_SCOPE;
  if (appCode === ORGANIZATION_APP_CODE) return ORG_PERMISSION_SCOPE;
  if (appCode === STUDYBUDDY_APP_CODE) return STUDYBUDDY_PERMISSION_SCOPE;
  if (appCode === QIANLAI_APP_CODE) return QIANLAI_PERMISSION_SCOPE;
  throw new Error(`Unknown application code: ${appCode}`);
}
