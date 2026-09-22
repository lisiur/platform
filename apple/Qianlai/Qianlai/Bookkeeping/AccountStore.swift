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

    // MARK: snapshot cache

    /// The store's snapshot-cache binding. Bump `schema` when the payload's
    /// shape changes incompatibly. Every surface builds its own instance,
    /// but they all read the same per-ledger record — so a remounted sheet
    /// paints the last-known chart instead of an empty grid.
    private static let cache = SnapshotCache.namespace("accounts", schema: 1)

    /// The record's identity: the ledger. Pure and nonisolated for tests.
    nonisolated static func snapshotKey(ledgerId: String) -> String {
        SnapshotCache.makeKey([ledgerId])
    }

    init() {
        #if DEBUG
        // Screenshot harness: pre-seed the sample chart so the quick-entry
        // grid renders offline (the matching ledger id also skips `load`).
        if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-quick-entry")
            || ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-quick-entry-recognition") {
            seedForDemo(Self.demoAccounts)
        }
        #endif
    }

    func load(ledgerId: String, force: Bool = false) async {
        guard force || self.ledgerId != ledgerId || items.isEmpty else { return }
        self.ledgerId = ledgerId
        // Paint the last-known chart before the fetch — the snapshot is the
        // render seed, the response only corrects it (a remounted sheet
        // shows the grid immediately instead of an empty flash).
        if items.isEmpty, let snapshot: [BookAccount] = Self.cache.read(
            key: Self.snapshotKey(ledgerId: ledgerId),
            as: [BookAccount].self
        ) {
            items = snapshot
        }
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
            Self.cache.write(
                key: Self.snapshotKey(ledgerId: ledgerId),
                payload: response.accounts
            )
        } catch {
            guard self.ledgerId == ledgerId else { return }
            // Hydrated (or otherwise loaded) content is stale-but-good: keep
            // it and skip the error so the UI doesn't flag data it is showing.
            guard items.isEmpty else { return }
            loadError = error.localizedDescription
        }
    }

    func reload() async {
        guard let ledgerId else { return }
        await load(ledgerId: ledgerId, force: true)
    }

    #if DEBUG
    /// Screenshot-harness seeding (`--ui-demo-quick-entry`): fills the tree
    /// with sample accounts so the quick-entry grid renders without a
    /// backend; the demo ledger id keeps `load` from ever hitting the API.
    /// A few ids go into the recents cache too (record dedupes, so repeat
    /// launches stay stable) so the recents row renders.
    func seedForDemo(_ accounts: [BookAccount]) {
        ledgerId = accounts.first?.ledgerId
        items = accounts
        for id in ["demo-food", "demo-transport", "demo-shopping", "demo-fun"] {
            RecentCategoryStore.record(id, ledgerId: "demo-ledger", kind: .expense)
        }
    }

    /// Sample expense chart + money pockets for `seedForDemo`.
    static let demoAccounts: [BookAccount] = [
        ("demo-food", "吃饭", "🍜"),
        ("demo-groceries", "生鲜果蔬", "🛒"),
        ("demo-transport", "交通", "🚇"),
        ("demo-housing", "居家", "🏠"),
        ("demo-shopping", "购物", "🛍️"),
        ("demo-fun", "娱乐", "🎬"),
        ("demo-health", "医疗", "🏥"),
        ("demo-learn", "学习", "📚"),
    ].map { id, name, icon in
        BookAccount(
            id: id,
            ledgerId: "demo-ledger",
            name: name,
            code: nil,
            type: .expense,
            sortOrder: 0,
            parentId: nil,
            status: "active",
            icon: icon,
            flags: nil,
            meta: nil,
            createdAt: .now
        )
    }
    #endif

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
    /// The form always sends an icon (mandatory in the UI), so `icon` is
    /// non-nil on every edit save.
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

    /// Computes a drag-to-reorder from the flat (parent-first) tree list of
    /// one type and applies it to `items` immediately, so the dropped row
    /// settles into place instead of animating back while the request is in
    /// flight. The server only accepts position changes within an account's
    /// current sibling group and then compacts that group to a gapless
    /// 0..n-1 sequence — the returned body re-sends the whole sibling group
    /// (which for roots spans every type plus the hidden default pocket)
    /// with new indices, keeping non-participating members in their relative
    /// slots. Returns nil when the drag is a no-op (unknown account or
    /// dropped where it started); commit the result with `commitMove`.
    /// Call synchronously from onMove — the local apply is what List's drag
    /// animation reconciles against.
    func prepareMove(_ accountId: String, flatTargetIndex: Int) -> ReorderAccountsBody? {
        guard let moved = items.first(where: { $0.id == accountId }) else { return nil }

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
        guard let fromIndex = movable.firstIndex(where: { $0.id == accountId }) else { return nil }

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
        if newMovable.map(\.id) == movable.map(\.id) { return nil }

        var newOrder = group
        var spliceIndex = 0
        for index in newOrder.indices {
            let isSlot = newOrder[index].type == moved.type && !newOrder[index].isDefaultPocket
            if isSlot {
                newOrder[index] = newMovable[spliceIndex]
                spliceIndex += 1
            }
        }

        // Slot the re-spliced group back into `items` at its members' old
        // positions (sorted by sortOrder to match `group`'s order).
        let groupIndices = items.indices
            .filter { items[$0].parentId == moved.parentId }
            .sorted { items[$0].sortOrder < items[$1].sortOrder }
        var updated = items
        for (slot, index) in zip(newOrder, groupIndices) {
            updated[index] = slot
        }
        items = updated

        return ReorderAccountsBody(
            items: newOrder.enumerated().map { index, account in
                ReorderAccountItem(id: account.id, parentId: account.parentId, sortOrder: index)
            }
        )
    }

    /// Sends a prepared reorder and refreshes; a failure reloads first so
    /// the optimistic local order drops back to the server's.
    func commitMove(_ body: ReorderAccountsBody) async throws {
        guard let ledgerId else { return }
        do {
            _ = try await client.send(
                "POST",
                "bookkeeping/ledgers/\(ledgerId)/accounts/reorder",
                body: body
            )
        } catch {
            await reload()
            throw error
        }
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
