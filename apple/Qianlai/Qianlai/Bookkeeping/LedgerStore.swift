//
//  LedgerStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import Observation

/// Loads the caller's ledgers and resolves the active one: the persisted
/// choice when still valid, else the default, else the first active. An
/// empty list is a valid state (first-run or after leaving every ledger) —
/// surfaces show a create/empty state for it.
@MainActor
@Observable
final class LedgerStore {
    private static let activeLedgerKey = "qianlai.activeLedgerId"

    let client = APIClient.shared

    private(set) var ledgers: [QianlaiLedger] = []
    private(set) var isLoading = false
    /// True once any `load` has settled (success or failure). The
    /// dashboard's launch-window title hint keys off this instead of the
    /// transient `isLoading`, which is still false on the frames between
    /// the dashboard mounting and the app-level task starting the first
    /// fetch — a race that would otherwise leak the generic title for a
    /// frame.
    private(set) var hasLoaded = false
    private(set) var loadError: String?

    private var activeLedgerId: String? {
        didSet {
            UserDefaults.standard.set(activeLedgerId, forKey: Self.activeLedgerKey)
        }
    }

    init() {
        activeLedgerId = UserDefaults.standard.string(forKey: Self.activeLedgerKey)
    }

    /// The persisted choice when still valid, else the default active ledger,
    /// else the first active one. Archived ledgers are skipped as an
    /// auto-selection fallback (they are read-only).
    var activeLedger: QianlaiLedger? {
        WidgetDataStore.resolveActiveLedger(from: ledgers, storedId: activeLedgerId)
    }

    var activeLedgers: [QianlaiLedger] {
        ledgers.filter { $0.isActive }
    }

    var archivedLedgers: [QianlaiLedger] {
        ledgers.filter { $0.isArchived }
    }

    /// Editors+ may post entries and manage accounts on the active ledger.
    var canPost: Bool {
        activeLedger?.canPost ?? false
    }

    func load() async {
        isLoading = true
        defer {
            isLoading = false
            hasLoaded = true
        }
        do {
            let response: LedgersResponse = try await client.request("GET", "bookkeeping/ledgers")
            ledgers = response.ledgers
            loadError = nil
            // The resolved active ledger may differ from the persisted id
            // (deleted ledger, first launch) — the widget mirror has to
            // follow, and a stale widget timeline should refresh now.
            mirrorWidgetState()
            WidgetSync.reloadTimelines()
        } catch {
            loadError = error.localizedDescription
        }
    }

    func setActive(_ id: String?) {
        activeLedgerId = id
        mirrorWidgetState()
        WidgetSync.reloadTimelines()
    }

    /// Mirrors the widget-facing state into the shared App Group suite.
    /// `widget.activeLedger` holds the GUEST-FREE resolution — a guest of
    /// someone else's ledger must never see its name or stats in a widget —
    /// while the raw app context (id + guest flag) accompanies it so
    /// `ProjectStore` can mirror the quick-entry scope, which for guests is
    /// legitimately their invited project. The scoped-project mirror is
    /// cleared here: it belonged to the previous ledger context, and the
    /// project store re-mirrors the new scope when its load settles.
    private func mirrorWidgetState() {
        let widgetLedger = WidgetDataStore.resolveWidgetLedger(from: ledgers, storedId: activeLedgerId)
        WidgetDataStore.saveActiveLedgerId(widgetLedger?.id)
        WidgetDataStore.saveActiveLedger(widgetLedger)
        // Clear the scoped project only when the ledger context really
        // changed — loads re-run constantly, and a concurrent ProjectStore
        // load may have just re-mirrored the still-valid scope.
        if activeLedgerId != WidgetDataStore.loadAppActiveLedgerId() {
            WidgetDataStore.saveScopedProject(nil)
        }
        WidgetAppGroup.defaults?.set(activeLedgerId, forKey: WidgetDataStore.appActiveLedgerIdKey)
        WidgetAppGroup.defaults?.set(
            activeLedger?.isGuest ?? false,
            forKey: WidgetDataStore.appActiveLedgerIsGuestKey
        )
        WidgetSync.reloadTimelines()
    }

    // MARK: - CRUD

    func create(name: String, description: String?, currency: String?) async throws {
        let trimmedCurrency = currency?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        _ = try await client.send(
            "POST",
            "bookkeeping/ledgers",
            body: CreateLedgerBody(
                name: name,
                description: description,
                currency: (trimmedCurrency?.count == 3) ? trimmedCurrency : nil,
                seedStarterAccounts: true
            )
        )
        await load()
    }

    func update(
        _ ledger: QianlaiLedger,
        name: String,
        description: String?,
        currency: String
    ) async throws {
        let trimmedCurrency = currency.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        _ = try await client.send(
            "PATCH",
            "bookkeeping/ledgers/\(ledger.id)",
            body: UpdateLedgerBody(
                name: name,
                description: description,
                clearDescription: description == nil,
                currency: trimmedCurrency.count == 3 ? trimmedCurrency : nil,
                status: nil
            )
        )
        await load()
    }

    func archiveToggle(_ ledger: QianlaiLedger) async throws {
        let status = ledger.isActive ? "archived" : "active"
        _ = try await client.send(
            "PATCH",
            "bookkeeping/ledgers/\(ledger.id)",
            body: UpdateLedgerBody(name: nil, description: nil, clearDescription: false, currency: nil, status: status)
        )
        await load()
    }

    func delete(_ ledger: QianlaiLedger) async throws {
        _ = try await client.send("DELETE", "bookkeeping/ledgers/\(ledger.id)")
        if activeLedgerId == ledger.id {
            setActive(nil)
        }
        await load()
    }

    func leave(_ ledger: QianlaiLedger) async throws {
        _ = try await client.send("POST", "bookkeeping/ledgers/\(ledger.id)/leave")
        if activeLedgerId == ledger.id {
            setActive(nil)
        }
        await load()
    }

    /// Joins a ledger with a share code; returns the full redeem response —
    /// `projectId` is set when the code was a project invite (guest scoped
    /// to exactly that project). Codes are signed JWTs, so the text is
    /// trimmed but never case-folded.
    func join(code: String) async throws -> RedeemShareCodeResponse {
        let response: RedeemShareCodeResponse = try await client.request(
            "POST",
            "bookkeeping/share-codes/redeem",
            body: RedeemCodeBody(code: code.trimmingCharacters(in: .whitespacesAndNewlines))
        )
        await load()
        return response
    }
}
