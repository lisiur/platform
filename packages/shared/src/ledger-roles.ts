export const LEDGER_ROLES = ["owner", "editor", "viewer", "guest"] as const;
export type LedgerRole = (typeof LEDGER_ROLES)[number];

export const SHARE_ROLES = ["editor", "viewer"] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];

/**
 * `guest` is a project-scoped member: they can only see and create entries
 * inside projects they belong to (see the bookkeeping module's access
 * helpers), so every ledger-wide `roleAtLeast(role, min)` check with
 * min = viewer/editor/owner rejects them. `guest` itself is the "any
 * member" floor.
 */
export const ROLE_RANK: Record<LedgerRole, number> = {
  guest: 0,
  viewer: 1,
  editor: 2,
  owner: 3,
};

export function roleAtLeast(role: string, min: LedgerRole): boolean {
  const rank = ROLE_RANK[role as LedgerRole];
  return rank !== undefined && rank >= ROLE_RANK[min];
}

/**
 * Display order: owner → editor → viewer → guest. Ties keep insertion order
 * (`createdAt` ascending). Strings outside LEDGER_ROLES are pushed last.
 */
export function compareLedgerRole(a: string, b: string): number {
  const ra = ROLE_RANK[a as LedgerRole] ?? -1;
  const rb = ROLE_RANK[b as LedgerRole] ?? -1;
  return rb - ra;
}
