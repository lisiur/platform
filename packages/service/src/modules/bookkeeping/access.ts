import { HTTPException } from "hono/http-exception";
import { type LedgerRole, roleAtLeast } from "./domain";
import { ledgerRepository } from "./ledger.repository";
import { ledgerMemberRepository } from "./ledger-member.repository";

export type LedgerAccess = {
  ledger: { id: string; ownerId: string; status: string; name: string };
  membership: { role: LedgerRole };
};

/**
 * Guard for ledger-scoped routes. Non-members get a 404 (no existence leak),
 * members below the minimum role get a 403.
 */
export async function requireLedgerAccess(
  userId: string,
  ledgerId: string,
  minRole: LedgerRole,
): Promise<LedgerAccess> {
  const membership = await ledgerMemberRepository.findMembership(
    ledgerId,
    userId,
  );
  if (!membership) {
    throw new HTTPException(404, { message: "Ledger not found" });
  }
  if (!roleAtLeast(membership.role, minRole)) {
    throw new HTTPException(403, {
      message: `This action requires the ${minRole} role or higher`,
    });
  }
  const ledger = await ledgerRepository.findById(ledgerId);
  if (!ledger) {
    throw new HTTPException(404, { message: "Ledger not found" });
  }
  return {
    ledger: {
      id: ledger.id,
      ownerId: ledger.ownerId,
      status: ledger.status,
      name: ledger.name,
    },
    membership: { role: membership.role as LedgerRole },
  };
}

/** Rejects writes against archived ledgers. */
export function assertLedgerWritable(ledger: { status: string }): void {
  if (ledger.status !== "active") {
    throw new HTTPException(400, { message: "This ledger is archived" });
  }
}
