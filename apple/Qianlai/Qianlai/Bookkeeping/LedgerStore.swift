//
//  LedgerStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import Observation

/// Loads the caller's ledgers and resolves the active one: the persisted
/// choice when still valid, else the default, else the first active. The
/// first list call lazily provisions the default ledger server-side.
@MainActor
@Observable
final class LedgerStore {
    private static let activeLedgerKey = "qianlai.activeLedgerId"

    let client = APIClient.shared

    private(set) var ledgers: [QianlaiLedger] = []
    private(set) var isLoading = false
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
        ledgers.first { $0.id == activeLedgerId }
            ?? ledgers.first { $0.isDefault && $0.isActive }
            ?? ledgers.first { $0.isActive }
            ?? ledgers.first
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
        defer { isLoading = false }
        do {
            let response: LedgersResponse = try await client.request("GET", "bookkeeping/ledgers")
            ledgers = response.ledgers
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    func setActive(_ id: String?) {
        activeLedgerId = id
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

    /// Joins a ledger with a share code; returns the joined ledger id.
    func join(code: String) async throws -> String {
        let response: RedeemShareCodeResponse = try await client.request(
            "POST",
            "bookkeeping/share-codes/redeem",
            body: RedeemCodeBody(code: code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased())
        )
        await load()
        return response.ledgerId
    }
}
