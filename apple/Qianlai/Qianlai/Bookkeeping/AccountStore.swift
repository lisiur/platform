//
//  AccountStore.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import Foundation
import Observation

/// Chart of accounts for the active ledger: load, tree building, quick-entry
/// pick lists, CRUD, drag-to-reorder, and balance adjustment.
@MainActor
@Observable
final class AccountStore {
    let client = APIClient.shared

    private(set) var items: [BookAccount] = []
    private(set) var isLoading = false
    private(set) var loadError: String?

    /// The ledger this store was last loaded for; guards against a ledger
    /// switch racing a late response.
    private(set) var ledgerId: String?

    func load(ledgerId: String, force: Bool = false) async {
        guard force || self.ledgerId != ledgerId || items.isEmpty else { return }
        self.ledgerId = ledgerId
        isLoading = true
        defer { isLoading = false }
        do {
            let response: AccountsResponse = try await client.request(
                "GET",
                "bookkeeping/ledgers/\(ledgerId)/accounts"
            )
            guard self.ledgerId == ledgerId else { return }
            items = response.accounts
            loadError = nil
        } catch {
            guard self.ledgerId == ledgerId else { return }
            loadError = error.localizedDescription
        }
    }

    func reload() async {
        guard let ledgerId else { return }
        await load(ledgerId: ledgerId, force: true)
    }

    // MARK: - Derived lists

    /// Accounts visible in the UI: the seeded default pocket is hidden (it is
    /// a prefill-only system account), everything else is listed.
    var visible: [BookAccount] {
        items.filter { !$0.isDefaultPocket }
    }

    func byType(_ type: AccountType, includeArchived: Bool = true) -> [BookAccount] {
        visible
            .filter { $0.type == type && (includeArchived || !$0.isArchived) }
            .sorted { $0.sortOrder < $1.sortOrder }
    }

    /// Pickable accounts for quick entry: active, non-default-pocket.
    var pickable: [BookAccount] {
        items.filter { !$0.isArchived && !$0.isDefaultPocket }
    }

    /// Asset + liability accounts — the "money pockets".
    var assetLike: [BookAccount] {
        pickable.filter { $0.isAssetLike }
    }

    func find(_ id: String) -> BookAccount? {
        items.first { $0.id == id }
    }

    // MARK: - CRUD

    func create(
        ledgerId: String,
        name: String,
        type: AccountType,
        parent: BookAccount?,
        icon: String?,
        meta: [String: JSONValue]?,
        realAccountId: String?
    ) async throws {
        _ = try await client.send(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/accounts",
            body: CreateAccountBody(
                name: name,
                type: type,
                parentId: parent?.id,
                icon: icon,
                meta: meta,
                realAccountId: realAccountId,
                linkRealAccount: (type == .asset || type == .liability) && realAccountId != nil
            )
        )
        await reload()
    }

    /// `linkRealAccount` is only sent when the user actually changed the link,
    /// so an untouched save never unlinks a master another member linked.
    func update(
        _ account: BookAccount,
        name: String?,
        icon: String?,
        meta: [String: JSONValue]?,
        realAccountId: String?,
        linkRealAccount: Bool
    ) async throws {
        _ = try await client.send(
            "PATCH",
            "bookkeeping/ledgers/\(account.ledgerId)/accounts/\(account.id)",
            body: UpdateAccountBody(
                name: name,
                icon: icon,
                meta: meta,
                status: nil,
                realAccountId: realAccountId,
                linkRealAccount: linkRealAccount && account.isAssetLike
            )
        )
        await reload()
    }

    func archiveToggle(_ account: BookAccount) async throws {
        let status = account.isArchived ? "active" : "archived"
        _ = try await client.send(
            "PATCH",
            "bookkeeping/ledgers/\(account.ledgerId)/accounts/\(account.id)",
            body: UpdateAccountBody(
                name: nil,
                icon: nil,
                meta: nil,
                status: status,
                realAccountId: nil,
                linkRealAccount: false
            )
        )
        await reload()
    }

    func delete(_ account: BookAccount) async throws {
        _ = try await client.send(
            "DELETE",
            "bookkeeping/ledgers/\(account.ledgerId)/accounts/\(account.id)"
        )
        await reload()
    }

    /// Applies a drag-to-reorder from the flat (parent-first) tree list of one
    /// type. The server only accepts position changes within an account's
    /// current sibling group and then compacts that group to a gapless
    /// 0..n-1 sequence — so we re-send the whole sibling group (which for
    /// roots spans every type plus the hidden default pocket) with new
    /// indices, keeping non-participating members in their relative slots.
    func move(_ accountId: String, flatTargetIndex: Int) async throws {
        guard let ledgerId,
              let moved = items.first(where: { $0.id == accountId })
        else { return }

        // The flat parent-first list as shown in the UI (one type, no
        // archived filter so indices line up with the rendered rows).
        let entriesAll = AccountTreeEntry.build(
            items.filter { $0.type == moved.type },
            includeArchived: true
        )

        // Sibling group across all types (roots share parentId nil).
        let group = items
            .filter { $0.parentId == moved.parentId }
            .sorted { $0.sortOrder < $1.sortOrder }
        let movable = group.filter { $0.type == moved.type && !$0.isDefaultPocket }
        guard let fromIndex = movable.firstIndex(where: { $0.id == accountId }) else { return }

        // Translate the flat drop index into an index within the type's
        // movable sequence: count movable rows above the drop position.
        let idsAbove = Set(
            entriesAll[..<min(max(flatTargetIndex, 0), entriesAll.count)]
                .map(\.account.id)
        )
        var targetIndex = movable.filter { idsAbove.contains($0.id) }.count
        if targetIndex > fromIndex { targetIndex -= 1 }
        targetIndex = min(max(targetIndex, 0), movable.count - 1)

        // Splice the moved member into the group's type-slots.
        var newMovable = movable
        let movedAccount = newMovable.remove(at: fromIndex)
        newMovable.insert(movedAccount, at: targetIndex)

        var newOrder = group
        var spliceIndex = 0
        for index in newOrder.indices {
            let isSlot = newOrder[index].type == moved.type && !newOrder[index].isDefaultPocket
            if isSlot {
                newOrder[index] = newMovable[spliceIndex]
                spliceIndex += 1
            }
        }

        let body = ReorderAccountsBody(
            items: newOrder.enumerated().map { index, account in
                ReorderAccountItem(id: account.id, parentId: account.parentId, sortOrder: index)
            }
        )
        _ = try await client.send(
            "POST",
            "bookkeeping/ledgers/\(ledgerId)/accounts/reorder",
            body: body
        )
        await reload()
    }

    /// Sets an account's balance as of a date; the server posts a balancing
    /// adjustment entry. Returns false when the account already had the
    /// target balance (no-op).
    @discardableResult
    func setBalance(
        _ account: BookAccount,
        balance: Double,
        date: Date,
        memo: String?
    ) async throws -> Bool {
        let response: SetBalanceResponse = try await client.request(
            "POST",
            "bookkeeping/ledgers/\(account.ledgerId)/accounts/\(account.id)/balance",
            body: SetBalanceBody(
                balance: balance,
                // The as-of cutoff is the END of the picked LOCAL day, so
                // entries recorded on that day count toward the balance.
                date: ApiQuery.iso(AppDates.localEndOfDay(date)),
                memo: memo
            )
        )
        await reload()
        return response.adjusted
    }
}
