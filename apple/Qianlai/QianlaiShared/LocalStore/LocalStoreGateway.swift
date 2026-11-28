//
//  LocalStoreGateway.swift
//  Qianlai
//

import Foundation

/// The app-process home of the local stack (T1.7's routing hub): owns the
/// `LocalDatabase` and the repositories over it, and answers the one
/// question every networked store asks at method entry — is this ledger
/// local? The registry of local ids loads from the store at activation
/// and refreshes after every lifecycle mutation, so the routing predicate
/// is one Set lookup, never a database round trip.
///
/// The gateway is MainActor like the stores it serves; the repositories
/// themselves hop onto GRDB's async lanes, so nothing here blocks the
/// main thread on I/O.
///
/// Flag discipline (R2): with `FeatureFlag.localLedgerEnabled == false`
/// the gateway never opens the database and `isLocal` answers false for
/// every id — the app behaves exactly like the pre-local build (cloud
/// only, login-gated).
@MainActor
final class LocalStoreGateway {
    static let shared = LocalStoreGateway()

    private(set) var database: LocalDatabase?
    private(set) var ledgerRepository: LocalLedgerRepository?
    private(set) var journalRepository: LocalJournalRepository?
    private(set) var reportRepository: LocalReportRepository?
    private var localLedgerIds: Set<String> = []
    private var activated = false

    private init() {}

    /// Opens the store and loads the routing registry. Idempotent; a
    /// storage failure (missing App Group container) leaves the gateway
    /// inert — local routing stays off and cloud-only behavior holds.
    func activate() {
        guard !activated else { return }
        activated = true
        guard FeatureFlag.localLedgerEnabled else { return }
        guard let database = LocalDatabase.shared else { return }
        self.database = database
        let ledger = LocalLedgerRepository(database: database)
        ledgerRepository = ledger
        journalRepository = LocalJournalRepository(database: database)
        reportRepository = LocalReportRepository(database: database)
        Task { [weak self] in
            guard let self else { return }
            let ids = (try? await ledger.ledgerIds()) ?? []
            localLedgerIds = ids
        }
    }

    /// The routing predicate every networked store consults: true only
    /// when the id is a known local ledger (unknown/never-activated ids
    /// are cloud).
    func isLocal(_ ledgerId: String?) -> Bool {
        guard let ledgerId else { return false }
        return localLedgerIds.contains(ledgerId)
    }

    /// Refreshes the registry after lifecycle mutations (create, delete,
    /// upgrade). A failed refresh keeps the stale registry — the next
    /// mutation retries.
    func refreshRegistry() async {
        guard let ledgerRepository else { return }
        localLedgerIds = (try? await ledgerRepository.ledgerIds()) ?? localLedgerIds
    }

    /// The local ledger's row shape, when the id routes local.
    func ledger(id: String) async -> QianlaiLedger? {
        guard let ledgerRepository else { return nil }
        return try? await ledgerRepository.ledger(id: id)
    }

    /// The registry, loaded synchronously when the async activation read
    /// hasn't landed yet. The scoped sign-out sweep (clearSession) runs on
    /// this path; one tiny id-list query on the calling thread is the
    /// price of not silently wiping local caches on a launch-race logout.
    func localLedgerIdSnapshot() -> Set<String> {
        if !localLedgerIds.isEmpty { return localLedgerIds }
        guard let repository = ledgerRepository else { return [] }
        let ids = (try? repository.ledgerIdsBlocking()) ?? []
        localLedgerIds = ids
        return ids
    }

    /// The active local-ledger id, when the app's raw active context
    /// routes local — the owner-scoped surfaces (real accounts) resolve
    /// their pockets against it. The raw mirror (guest-free resolution
    /// excluded) is what every active-ledger reader uses.
    func ledgerIdForRealAccounts() -> String? {
        guard let id = WidgetDataStore.loadAppActiveLedgerId() else { return nil }
        return isLocal(id) ? id : nil
    }
}
