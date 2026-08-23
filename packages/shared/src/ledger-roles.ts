export const LEDGER_ROLES = ["owner", "editor", "viewer"] as const;
export type LedgerRole = (typeof LEDGER_ROLES)[number];

export const SHARE_ROLES = ["editor", "viewer"] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];

export const ROLE_RANK: Record<LedgerRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export function roleAtLeast(role: string, min: LedgerRole): boolean {
  const rank = ROLE_RANK[role as LedgerRole];
  return rank !== undefined && rank >= ROLE_RANK[min];
}

/**
 * Display order: owner → editor → viewer. Ties keep insertion order
 * (`createdAt` ascending). Strings outside LEDGER_ROLES are pushed last.
 */
export function compareLedgerRole(a: string, b: string): number {
  const ra = ROLE_RANK[a as LedgerRole] ?? -1;
  const rb = ROLE_RANK[b as LedgerRole] ?? -1;
  return rb - ra;
}
