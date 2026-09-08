import type { ConfigurableTab, QuickEntryChipField } from "./domain";
import { preferenceRepository } from "./preference.repository";

/** User-scope payload: the visible configurable tabs, in display order. */
export type TabsData = { tabs: ConfigurableTab[] };

/** Ledger/project-scope payload: quick-entry chip arrangement. */
export type QuickEntryData = {
  quickEntry: { chipFields: QuickEntryChipField[] };
};

export type UserPreferencesSummary = {
  user: TabsData | null;
  ledgers: Record<string, QuickEntryData>;
  projects: Record<string, QuickEntryData>;
};

export async function listPreferences(
  userId: string,
): Promise<UserPreferencesSummary> {
  const rows = await preferenceRepository.listForUser(userId);
  const summary: UserPreferencesSummary = {
    user: null,
    ledgers: {},
    projects: {},
  };
  for (const row of rows) {
    // Rows are only written through the validated route bodies below, so a
    // plain cast back is safe; the group dispatch is by scopeType, not by
    // trusting the payload shape.
    const data = row.data as unknown as TabsData | QuickEntryData;
    if (row.scopeType === "user") {
      summary.user = data as TabsData;
    } else if (row.scopeType === "ledger") {
      summary.ledgers[row.scopeId] = data as QuickEntryData;
    } else if (row.scopeType === "project") {
      summary.projects[row.scopeId] = data as QuickEntryData;
    }
  }
  return summary;
}

export async function updateUserPreferences(
  userId: string,
  data: TabsData,
): Promise<TabsData> {
  await preferenceRepository.upsert(userId, "user", "", data);
  return data;
}

export async function updateLedgerPreferences(
  userId: string,
  ledgerId: string,
  data: QuickEntryData,
): Promise<QuickEntryData> {
  await preferenceRepository.upsert(userId, "ledger", ledgerId, data);
  return data;
}

export async function updateProjectPreferences(
  userId: string,
  projectId: string,
  data: QuickEntryData,
): Promise<QuickEntryData> {
  await preferenceRepository.upsert(userId, "project", projectId, data);
  return data;
}

/**
 * Resets a scope back to defaults by dropping the row. Membership is
 * enforced at the routes ("guest" floor): preference rows belong to their
 * ledger/project — the row's userId only marks the creator — so the
 * creator (and the owner) may reset while they remain members. The where
 * clause still keys on the caller's own userId, so this can only ever
 * clear the caller's own preference.
 */
export async function clearPreferences(
  userId: string,
  scopeType: "user" | "ledger" | "project",
  scopeId: string,
): Promise<void> {
  await preferenceRepository.remove(userId, scopeType, scopeId);
}
