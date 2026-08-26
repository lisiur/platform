//
//  RealAccountStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import Observation

/// Real-world asset masters (bank cards, wallets) with their cross-ledger
/// pockets. Owner-private: pockets reveal the caller's own links only.
@MainActor
@Observable
final class RealAccountStore {
    let client = APIClient.shared

    private(set) var realAccounts: [RealAccount] = []
    private(set) var totals: RealAccountTotals?
    private(set) var isLoading = false
    private(set) var loadError: String?

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response: RealAccountsResponse = try await client.request(
                "GET",
                "bookkeeping/real-accounts"
            )
            realAccounts = response.realAccounts
            totals = response.totals
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    func create(
        name: String,
        type: AccountType,
        icon: String?,
        meta: [String: JSONValue]?
    ) async throws {
        _ = try await client.send(
            "POST",
            "bookkeeping/real-accounts",
            body: CreateRealAccountBody(name: name, type: type, icon: icon, meta: meta)
        )
        await load()
    }

    func update(
        _ real: RealAccount,
        name: String,
        icon: String?,
        meta: [String: JSONValue]?
    ) async throws {
        _ = try await client.send(
            "PATCH",
            "bookkeeping/real-accounts/\(real.id)",
            body: UpdateRealAccountBody(name: name, status: nil, icon: icon, meta: meta)
        )
        await load()
    }

    func archiveToggle(_ real: RealAccount) async throws {
        let status = real.isArchived ? "active" : "archived"
        _ = try await client.send(
            "PATCH",
            "bookkeeping/real-accounts/\(real.id)",
            body: UpdateRealAccountBody(name: nil, status: status, icon: nil, meta: nil)
        )
        await load()
    }

    func delete(_ real: RealAccount) async throws {
        _ = try await client.send(
            "DELETE",
            "bookkeeping/real-accounts/\(real.id)"
        )
        await load()
    }

    /// Mapping of ledger pocket id → owning real account id, for the
    /// account-form link picker.
    var pocketLinks: [String: String] {
        var links: [String: String] = [:]
        for real in realAccounts {
            for pocket in real.pockets {
                links[pocket.id] = real.id
            }
        }
        return links
    }
}
