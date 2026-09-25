import { prisma } from "#lib/db";

/**
 * Ownership predicate for qianlai journal entries' photo receipts: any
 * member of the entry's ledger may sign a private receipt's url (guests
 * included — they can read the entry, so they can view its photos).
 *
 * Deliberately a leaf module: `attachment.service` imports it for its
 * signFile owner check, so nothing here may import the rest of
 * bookkeeping — `journal.service` already imports attachment.service,
 * and a richer import would close a cycle. The journal tables are
 * reached through the shared prisma client, not the bookkeeping module
 * surface.
 */
export async function journalEntryAttachmentOwnerAllows(
  bizId: string,
  userId: string,
): Promise<boolean> {
  const entry = await prisma.journalEntry.findUnique({
    where: { id: bizId },
    select: { ledgerId: true },
  });
  if (!entry) return false;
  const member = await prisma.ledgerMember.findUnique({
    where: {
      ledgerId_userId: { ledgerId: entry.ledgerId, userId },
    },
    select: { id: true },
  });
  return member != null;
}
