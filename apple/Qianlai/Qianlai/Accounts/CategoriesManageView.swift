//
//  CategoriesManageView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/27.
//

import SwiftUI

/// Income and expense chart of accounts of the active ledger — the
/// classification side of bookkeeping. A collapsible tree: only top-level
/// rows show by default, and tapping a parent toggles its sub-categories
/// open/closed instead of opening the editor, which stays reachable through
/// the row menu. Split from `AccountsView` (the Me page's flat
/// asset/liability screen) so the two personalities can evolve apart;
/// shared row rendering and row actions live in `AccountTreeRow`.
struct CategoriesManageView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(RealAccountStore.self) private var realAccountStore
    @Environment(ToastCenter.self) private var toast
    @State private var store = AccountStore()
    @State private var selectedType: AccountType = .expense
    @State private var expandedIds: Set<String> = []
    @State private var editingAccount: BookAccount?
    @State private var createParent: BookAccount?
    @State private var isShowingCreate = false
    @State private var balanceAccount: BookAccount?
    @State private var accountPendingDelete: BookAccount?
    @State private var isReordering = false

    /// Equity is system-managed; expenses come first, matching the
    /// quick-entry grid's ordering.
    private let managedTypes: [AccountType] = [.expense, .income]

    private var canManage: Bool {
        ledgerStore.canPost
    }

    var body: some View {
        Group {
            if ledgerStore.isLoading, ledgerStore.ledgers.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let ledger = ledgerStore.activeLedger {
                list(ledger)
            } else {
                EmptyStateView(
                    message: L10n.string("dashboard.selectLedger", defaultValue: "Select a ledger to get started"),
                    systemImage: "book"
                )
            }
        }
        .navigationTitle(Text(L10n.string("categories.title", defaultValue: "Categories")))
        .toolbar {
            #if os(iOS)
            if canManage {
                ToolbarItem(placement: .navigation) {
                    Button {
                        isReordering.toggle()
                    } label: {
                        Label(L10n.string("accounts.reorder", defaultValue: "Reorder"), systemImage: "arrow.up.arrow.down")
                    }
                }
            }
            #endif
            if canManage {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        isShowingCreate = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel(Text(L10n.string("categories.new", defaultValue: "New Category")))
                }
            }
        }
        .environment(store)
        .environment(realAccountStore)
        .task(id: ledgerStore.activeLedger?.id) {
            guard let id = ledgerStore.activeLedger?.id else { return }
            await store.load(ledgerId: id)
            await realAccountStore.load()
        }
        .sheet(isPresented: $isShowingCreate) {
            NavigationStack {
                AccountFormView(account: nil, parent: nil, onSave: createSave)
            }
        }
        .sheet(item: $editingAccount) { account in
            NavigationStack {
                AccountFormView(
                    account: account,
                    parent: nil,
                    seededLink: realAccountStore.pocketLinks[account.id] ?? noRealAccount,
                    onSave: editSave
                )
            }
        }
        .sheet(item: $createParent) { parent in
            NavigationStack {
                AccountFormView(account: nil, parent: parent, onSave: createSave)
            }
        }
        .sheet(item: $balanceAccount) { account in
            NavigationStack {
                BalanceAdjustmentView(account: account)
            }
            .environment(store)
            .environment(toast)
        }
        .alert(
            L10n.string("accounts.delete", defaultValue: "Delete"),
            isPresented: Binding(
                get: { accountPendingDelete != nil },
                set: { if !$0 { accountPendingDelete = nil } }
            )
        ) {
            Button(L10n.string("common.delete", defaultValue: "Delete"), role: .destructive) {
                if let account = accountPendingDelete {
                    Task { await delete(account) }
                }
                accountPendingDelete = nil
            }
            Button(L10n.string("common.cancel", defaultValue: "Cancel"), role: .cancel) { accountPendingDelete = nil }
        } message: {
            if let account = accountPendingDelete {
                Text(L10n.string("categories.deleteConfirm", defaultValue: "Delete category “%@”?", account.displayName))
            }
        }
    }

    @ViewBuilder
    private func list(_ ledger: QianlaiLedger) -> some View {
        List {
            Section {
                Picker(L10n.string("accounts.type", defaultValue: "Type"), selection: $selectedType) {
                    ForEach(managedTypes, id: \.self) { type in
                        Text(type.label).tag(type)
                    }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
            }

            let entries = treeEntries
            let parentIds = Set(entries.compactMap(\.account.parentId))
            let visible = revealedEntries

            if entries.isEmpty {
                EmptyStateView(
                    message: L10n.string("categories.empty", defaultValue: "No categories"),
                    systemImage: "chart.bar.doc.horizontal"
                )
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            } else {
                ForEach(visible) { entry in
                    row(entry.account, hasChildren: parentIds.contains(entry.account.id))
                        .listRowInsets(EdgeInsets(top: 6, leading: 12 + CGFloat(entry.depth) * 18, bottom: 6, trailing: 12))
                }
                .onMove { source, destination in
                    let accountId = movedAccountId(from: source)
                    guard !accountId.isEmpty else { return }
                    Task {
                        do {
                            try await store.move(accountId, flatTargetIndex: flatIndexOfDrop(at: destination))
                        } catch {
                            toast.show(error.localizedDescription)
                        }
                    }
                }
            }

            if !ledger.canPost {
                Label(
                    L10n.string("categories.editorRequired", defaultValue: "Editor access or higher is required to manage categories."),
                    systemImage: "lock"
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
                .listRowSeparator(.hidden)
            }
        }
        #if os(iOS)
        .environment(\.editMode, .constant(isReordering ? .active : .inactive))
        // macOS lists reorder by dragging directly — no edit mode needed.
        #endif
        .refreshable {
            await store.reload()
        }
    }

    private var typedAccounts: [BookAccount] {
        store.items.filter { $0.type == selectedType && !$0.isDefaultPocket }
    }

    /// Flat parent-first list of the selected type, including archived rows.
    private var treeEntries: [AccountTreeEntry] {
        AccountTreeEntry.build(typedAccounts, includeArchived: true)
    }

    /// Tree entries revealed under the current expansion state — unexpanded
    /// parents' descendants stay hidden.
    private var revealedEntries: [AccountTreeEntry] {
        let entries = treeEntries
        let byId = Dictionary(uniqueKeysWithValues: typedAccounts.map { ($0.id, $0) })
        return entries.filter { entry in
            var parent = entry.account.parentId.flatMap { byId[$0] }
            while let current = parent {
                guard expandedIds.contains(current.id) else { return false }
                parent = current.parentId.flatMap { byId[$0] }
            }
            return true
        }
    }

    private func movedAccountId(from source: IndexSet) -> String {
        // Single-item drags only; take the first moved id.
        let visible = revealedEntries
        guard let index = source.first, index < visible.count else { return "" }
        return visible[index].account.id
    }

    /// Maps a List drop position among the revealed rows onto the flat
    /// parent-first index `AccountStore.move` expects; a drop past the end
    /// anchors to the full list's tail.
    private func flatIndexOfDrop(at destination: Int) -> Int {
        let visible = revealedEntries
        let all = treeEntries
        guard destination < visible.count,
              let anchor = all.firstIndex(where: { $0.id == visible[destination].id })
        else { return all.count }
        return anchor
    }

    private func row(_ account: BookAccount, hasChildren: Bool) -> some View {
        AccountTreeRow(
            account: account,
            hasChildren: hasChildren,
            disclosesExpansion: true,
            isExpanded: expandedIds.contains(account.id),
            canManage: canManage,
            menuItems: rowMenuItems(account),
            onTap: {
                guard hasChildren else { return }
                withAnimation(.snappy) {
                    if expandedIds.contains(account.id) {
                        expandedIds.remove(account.id)
                    } else {
                        expandedIds.insert(account.id)
                    }
                }
            }
        )
    }

    /// Row actions shared by the long-press context menu and the trailing
    /// ellipsis menu; gated on `canManage` at each call site.
    private func rowMenuItems(_ account: BookAccount) -> some View {
        AccountRowMenuItems(
            account: account,
            addSubLabel: L10n.string("categories.addSub", defaultValue: "Add Sub-category")
        ) {
            editingAccount = account
        } onSetBalance: {
            balanceAccount = account
        } onAddSub: {
            createParent = account
        } onArchiveToggle: {
            Task { await archiveToggle(account) }
        } onDelete: {
            accountPendingDelete = account
        }
    }

    // MARK: - Mutations

    private func createSave(_ result: AccountFormResult) async -> Bool {
        guard let ledgerId = ledgerStore.activeLedger?.id else { return false }
        guard let name = result.name else {
            toast.show(L10n.string("accounts.nameRequired", defaultValue: "Name is required"))
            return false
        }
        do {
            try await store.create(
                ledgerId: ledgerId,
                name: name,
                type: createParent?.type ?? selectedType,
                parent: createParent,
                icon: result.icon,
                meta: result.meta,
                realAccountId: result.realAccountId
            )
            toast.show(L10n.string("categories.createSuccess", defaultValue: "Category created"))
            createParent = nil
            return true
        } catch {
            toast.show(error.localizedDescription)
            return false
        }
    }

    private func editSave(_ result: AccountFormResult) async -> Bool {
        guard let account = editingAccount else { return false }
        do {
            try await store.update(
                account,
                name: result.name,
                icon: result.icon,
                meta: result.meta,
                realAccountId: result.realAccountId,
                linkRealAccount: result.linkChanged
            )
            if result.linkChanged {
                await realAccountStore.load()
            }
            toast.show(L10n.string("categories.updateSuccess", defaultValue: "Category updated"))
            editingAccount = nil
            return true
        } catch {
            toast.show(error.localizedDescription)
            return false
        }
    }

    private func archiveToggle(_ account: BookAccount) async {
        do {
            try await store.archiveToggle(account)
            toast.show(
                account.isArchived
                    ? L10n.string("categories.unarchiveSuccess", defaultValue: "Category unarchived")
                    : L10n.string("categories.archiveSuccess", defaultValue: "Category archived")
            )
        } catch {
            toast.show(friendlyAccountError(error))
        }
    }

    private func delete(_ account: BookAccount) async {
        do {
            try await store.delete(account)
            toast.show(L10n.string("categories.deleteSuccess", defaultValue: "Category deleted"))
        } catch {
            toast.show(friendlyAccountError(error))
        }
    }

    /// Maps server refusals (journal lines / children / builtin) to the same
    /// friendly copy the webapp shows.
    private func friendlyAccountError(_ error: Error) -> String {
        let message = error.localizedDescription
        if message.range(of: "journal lines", options: .caseInsensitive) != nil {
            return L10n.string("categories.hasLinesError", defaultValue: "This category has journal lines. Archive it instead.")
        }
        if message.range(of: "children", options: .caseInsensitive) != nil {
            return L10n.string("categories.hasChildrenError", defaultValue: "Delete or move its sub-categories first.")
        }
        if message.range(of: "Built-in", options: .caseInsensitive) != nil {
            return L10n.string("categories.builtinError", defaultValue: "System categories can't be modified this way.")
        }
        return message
    }
}
