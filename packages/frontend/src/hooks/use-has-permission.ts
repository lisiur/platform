"use client";

import type { SessionData } from "../types";

function matchSingle(pattern: string, permission: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(":*")) {
    const prefix = pattern.slice(0, -2);
    return permission.startsWith(`${prefix}:`);
  }
  return pattern === permission;
}

/**
 * Tests a permission code against the session's effective permission list.
 * Mirrors the service-side matcher: supports `*` and `<prefix>:*` wildcards
 * (e.g. `system/user:*` matches `system/user:list`) and `!`-prefixed
 * negations. Returns `false` when there is no session.
 */
export function hasPermission(
  session: SessionData,
  requiredPermission: string,
): boolean {
  const permissions = session?.permissions ?? [];

  for (const perm of permissions) {
    if (
      perm.startsWith("!") &&
      matchSingle(perm.slice(1), requiredPermission)
    ) {
      return false;
    }
  }

  for (const perm of permissions) {
    if (!perm.startsWith("!") && matchSingle(perm, requiredPermission)) {
      return true;
    }
  }

  return false;
}

type SessionStoreHook = <T>(selector: (state: { data: SessionData }) => T) => T;

/**
 * Binds {@link hasPermission} to an app's session store, returning a
 * `useHasPermission(code)` hook. Each app instantiates its own via
 * `createUseHasPermission(useSessionStore)`, matching the `createSessionStore`
 * pattern.
 */
export function createUseHasPermission(useSessionStore: SessionStoreHook) {
  return function useHasPermission(permission: string): boolean {
    return useSessionStore((state) => hasPermission(state.data, permission));
  };
}
