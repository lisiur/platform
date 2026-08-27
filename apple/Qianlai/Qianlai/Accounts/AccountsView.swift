//
//  AccountsView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Chart of accounts of the active ledger: type tabs, a flat parent-first
/// tree list with create/edit/archive/delete/set-balance, and drag reorder.
/// Configured with the account types it manages — asset/liability live under
/// "Accounts" on the Me page, income/expense under "Categories".
///
/// Collapsible mode (categories) shows only top-level rows by default and
/// taps toggle a parent's sub-accounts open/closed instead of opening the
/// editor, which stays reachable through the context menu.
struct AccountsView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(RealAccountStore.self) private var realAccountStore
    @Environment(ToastCenter.self) private var toast
    @State private var store = AccountStore()
    @State private var selectedType: AccountType
    @State private var expandedIds: Set<String> = []
    @State private var editingAccount: BookAccount?
    @State private var createParent: BookAccount?
    @State private var isShowingCreate = false
    @State private var balanceAccount: BookAccount?
    @State private var accountPendingDelete: BookAccount?
    @State private var isReordering = false

    /// Types shown in the tabs; equity is system-managed.
    private let managedTypes: [AccountType]
    private let navigationTitle: LocalizedStringKey
    private let collapsible: Bool

    init(
        managing types: [AccountType] = [.asset, .liability],
        title: LocalizedStringKey = "Accounts",
        collapsible: Bool = false
    ) {
        managedTypes = types
        navigationTitle = title
        self.collapsible = collapsible
        _selectedType = State(initialValue: types.first ?? .asset)
    }

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
        .navigationTitle(navigationTitle)
        .toolbar {
            #if os(iOS)
            if canManage {
                ToolbarItem(placement: .navigation) {
                    Button {
                        isReordering.toggle()
                    } label: {
                        Label("Reorder", systemImage: "arrow.up.arrow.down")
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
                    .accessibilityLabel(Text(L10n.string(
                        collapsible ? "categories.new" : "New Account",
                        defaultValue: collapsible ? "New Category" : "New Account"
                    )))
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
            Button("Delete", role: .destructive) {
                if let account = accountPendingDelete {
                    Task { await delete(account) }
                }
                accountPendingDelete = nil
            }
            Button("Cancel", role: .cancel) { accountPendingDelete = nil }
        } message: {
            if let account = accountPendingDelete {
                Text(L10n.string(
                    collapsible ? "categories.deleteConfirm" : "Delete account “%@”?",
                    defaultValue: collapsible ? "Delete category “%@”?" : "Delete account “%@”?",
                    account.displayName
                ))
            }
        }
    }

    @ViewBuilder
    private func list(_ ledger: QianlaiLedger) -> some View {
        List {
            Section {
                Picker("Type", selection: $selectedType) {
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
                    message: L10n.string(
                        collapsible ? "categories.empty" : "No accounts",
                        defaultValue: collapsible ? "No categories" : "No accounts"
                    ),
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
                    L10n.string(
                        collapsible
                            ? "categories.editorRequired"
                            : "Editor access or higher is required to manage accounts.",
                        defaultValue: collapsible
                            ? "Editor access or higher is required to manage categories."
                            : "Editor access or higher is required to manage accounts."
                    ),
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
        store.items.filter { $0.type == selectedType }
    }

    /// Flat parent-first list of the selected type, including archived rows.
    private var treeEntries: [AccountTreeEntry] {
        AccountTreeEntry.build(typedAccounts, includeArchived: true)
    }

    /// Tree entries revealed under the current expansion state — all of them
    /// unless collapsible mode hides unexpanded parents' descendants.
    private var revealedEntries: [AccountTreeEntry] {
        let entries = treeEntries
        guard collapsible else { return entries }
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
        guard collapsible else { return destination }
        let visible = revealedEntries
        let all = treeEntries
        guard destination < visible.count,
              let anchor = all.firstIndex(where: { $0.id == visible[destination].id })
        else { return all.count }
        return anchor
    }

    private func row(_ account: BookAccount, hasChildren: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                if let icon = account.icon, !icon.isEmpty {
                    Text(icon)
                }
                Text(account.displayName)
                    .font(.body.weight(account.parentId == nil ? .medium : .regular))
                    .strikethrough(account.isArchived)
                if account.isBuiltin {
                    BadgeView(text: L10n.string("accounts.builtin", defaultValue: "System"), outlined: true)
                }
                if account.isArchived {
                    BadgeView(text: L10n.string("status.archived", defaultValue: "Archived"), color: .orange)
                }
                Spacer()
                if collapsible {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(expandedIds.contains(account.id) ? 90 : 0))
                        .opacity(hasChildren ? 1 : 0)
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if collapsible {
                guard hasChildren else { return }
                withAnimation(.snappy) {
                    if expandedIds.contains(account.id) {
                        expandedIds.remove(account.id)
                    } else {
                        expandedIds.insert(account.id)
                    }
                }
            } else if canManage {
                editingAccount = account
            }
        }
        .contextMenu {
            if canManage {
                Button {
                    editingAccount = account
                } label: {
                    Label("Edit", systemImage: "pencil")
                }
                if account.isAssetLike {
                    Button {
                        balanceAccount = account
                    } label: {
                        Label("Set Balance", systemImage: "scalemass")
                    }
                }
                if account.parentId == nil, !account.isBuiltin {
                    Button {
                        createParent = account
                    } label: {
                        Label(
                            L10n.string(
                                collapsible ? "categories.addSub" : "Add Sub-account",
                                defaultValue: collapsible ? "Add Sub-category" : "Add Sub-account"
                            ),
                            systemImage: "arrow.turn.down.right"
                        )
                    }
                }
                if !account.isBuiltin {
                    Button {
                        Task { await archiveToggle(account) }
                    } label: {
                        Label(
                            account.isArchived ? "Unarchive" : "Archive",
                            systemImage: account.isArchived ? "archivebox.fill" : "archivebox"
                        )
                    }
                    Button(role: .destructive) {
                        accountPendingDelete = account
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
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
            toast.show(L10n.string(
                collapsible ? "categories.createSuccess" : "accounts.createSuccess",
                defaultValue: collapsible ? "Category created" : "Account created"
            ))
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
            toast.show(L10n.string(
                collapsible ? "categories.updateSuccess" : "accounts.updateSuccess",
                defaultValue: collapsible ? "Category updated" : "Account updated"
            ))
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
                    ? L10n.string(
                        collapsible ? "categories.unarchiveSuccess" : "accounts.unarchiveSuccess",
                        defaultValue: collapsible ? "Category unarchived" : "Account unarchived"
                    )
                    : L10n.string(
                        collapsible ? "categories.archiveSuccess" : "accounts.archiveSuccess",
                        defaultValue: collapsible ? "Category archived" : "Account archived"
                    )
            )
        } catch {
            toast.show(friendlyAccountError(error))
        }
    }

    private func delete(_ account: BookAccount) async {
        do {
            try await store.delete(account)
            toast.show(L10n.string(
                collapsible ? "categories.deleteSuccess" : "accounts.deleteSuccess",
                defaultValue: collapsible ? "Category deleted" : "Account deleted"
            ))
        } catch {
            toast.show(friendlyAccountError(error))
        }
    }

    /// Maps server refusals (journal lines / children / builtin) to the same
    /// friendly copy the webapp shows.
    private func friendlyAccountError(_ error: Error) -> String {
        let message = error.localizedDescription
        if message.range(of: "journal lines", options: .caseInsensitive) != nil {
            return L10n.string(
                collapsible ? "categories.hasLinesError" : "accounts.hasLinesError",
                defaultValue: collapsible
                    ? "This category has journal lines. Archive it instead."
                    : "This account has journal lines. Archive it instead."
            )
        }
        if message.range(of: "children", options: .caseInsensitive) != nil {
            return L10n.string(
                collapsible ? "categories.hasChildrenError" : "accounts.hasChildrenError",
                defaultValue: collapsible
                    ? "Delete or move its sub-categories first."
                    : "Delete or move its sub-accounts first."
            )
        }
        if message.range(of: "Built-in", options: .caseInsensitive) != nil {
            return L10n.string(
                collapsible ? "categories.builtinError" : "accounts.builtinError",
                defaultValue: collapsible
                    ? "System categories can't be modified this way."
                    : "Built-in accounts can't be modified this way."
            )
        }
        return message
    }
}

/// Sets an asset/liability account's balance; the server posts a balancing
/// entry against the system equity offset account.
struct BalanceAdjustmentView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AccountStore.self) private var store
    @Environment(ReportStore.self) private var reportStore
    @Environment(ToastCenter.self) private var toast

    let account: BookAccount

    @State private var balanceText = ""
    @State private var date = UTCDates.utcNow
    @State private var memo = ""
    @State private var error: String?
    @State private var isSaving = false

    var body: some View {
        Form {
            Section {
                FormField(title: "New Balance", error: nil) {
                    TextField("0.00", text: $balanceText)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                        .textFieldStyle(.plain)
                        .font(.body.monospacedDigit())
                }
                .listRowBackground(Color.clear)
                DatePicker("As of", selection: $date, displayedComponents: .date)
                TextField("Memo (e.g. cash count)", text: $memo)
                    .submitLabel(.done)
                    .onSubmit { dismissKeyboard() }
            } footer: {
                Text("A balanced entry against the system equity account is posted automatically. Entries after the as-of date are left untouched.")
            }

            if account.type == .liability {
                Section {
                    Label(
                        "A liability balance is the amount you owe.",
                        systemImage: "info.circle"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }

            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                        .font(.footnote)
                }
            }
        }
        .navigationTitle(Text("Set Balance — \(account.displayName)"))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
                    .disabled(isSaving)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(isSaving ? "Adjusting…" : "Adjust Balance") {
                    Task { await save() }
                }
                .disabled(isSaving)
            }
        }
    }

    private func save() async {
        let normalized = balanceText.replacingOccurrences(of: ",", with: ".")
        guard let balance = Double(normalized), balance >= 0 else {
            error = L10n.string("balance.min", defaultValue: "Balance can't be negative")
            return
        }
        error = nil
        isSaving = true
        defer { isSaving = false }
        do {
            let adjusted = try await store.setBalance(
                account,
                balance: balance,
                date: date,
                memo: memo.isEmpty ? nil : memo
            )
            toast.show(
                adjusted
                    ? L10n.string("balance.success", defaultValue: "Balance adjusted")
                    : L10n.string("balance.alreadyAtBalance", defaultValue: "The account already has this balance — nothing to adjust")
            )
            if adjusted {
                Task { await reportStore.refreshAfterPosting() }
            }
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
