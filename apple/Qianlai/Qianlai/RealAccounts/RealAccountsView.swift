//
//  RealAccountsView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Real-world asset masters with their cross-ledger pockets. Private to the
/// caller — pockets reveal only the caller's own links.
struct RealAccountsView: View {
    @Environment(RealAccountStore.self) private var store
    @Environment(ToastCenter.self) private var toast
    @State private var editing: RealAccount?
    @State private var isShowingCreate = false
    @State private var pendingDelete: RealAccount?

    var body: some View {
        List {
            if store.isLoading, store.realAccounts.isEmpty {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .listRowSeparator(.hidden)
                .appCardRow()
            } else if let error = store.loadError, store.realAccounts.isEmpty {
                ErrorRetryView(message: error) {
                    Task { await store.load() }
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            } else {
                Section {
                    HStack(spacing: 10) {
                        StatCard(icon: "wallet.pass", label: L10n.string("realAccounts.assetsLabel", defaultValue: "Assets"), value: store.totals?.assets)
                        StatCard(icon: "banknote", label: L10n.string("realAccounts.liabilities", defaultValue: "Liabilities"), value: store.totals?.liabilities)
                    }
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                    StatCard(
                        icon: "building.columns",
                        label: L10n.string("common.netWorth", defaultValue: "Net Worth"),
                        value: store.totals?.netWorth,
                        tone: (store.totals?.netWorth ?? 0) < 0 ? .negative : .default
                    )
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                }

                Section {
                    if store.realAccounts.isEmpty {
                        EmptyStateView(
                            message: L10n.string("realAccounts.empty", defaultValue: "No real accounts yet"),
                            systemImage: "creditcard"
                        )
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                    } else {
                        ForEach(store.realAccounts) { real in
                            card(real)
                        }
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                    }
                } header: {
                    Text(L10n.string("realAccounts.screenName", defaultValue: "Real Accounts"))
                } footer: {
                    Text(L10n.string("realAccounts.introFooter", defaultValue: "Real accounts track real-world wallets across ledgers. Link them to ledger accounts on the accounts page. Visible only to you."))
                }
            }
        }
        .appBackgroundCanvas()
        .navigationTitle(Text(L10n.string("realAccounts.title", defaultValue: "Assets")))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    isShowingCreate = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(Text(L10n.string("realAccounts.newTitle", defaultValue: "New Real Account")))
            }
        }
        .task {
            await store.load()
        }
        .sheet(isPresented: $isShowingCreate) {
            NavigationStack {
                RealAccountFormView(real: nil)
            }
        }
        .sheet(item: $editing) { real in
            NavigationStack {
                RealAccountFormView(real: real)
            }
        }
        .alert(
            L10n.string("realAccounts.delete", defaultValue: "Delete"),
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            )
        ) {
            Button(L10n.string("common.delete", defaultValue: "Delete"), role: .destructive) {
                if let real = pendingDelete {
                    Task {
                        do {
                            try await store.delete(real)
                            toast.show(L10n.string("realAccounts.deleteSuccess", defaultValue: "Real account deleted"))
                        } catch {
                            toast.show(friendlyError(error))
                        }
                    }
                }
                pendingDelete = nil
            }
            Button(L10n.string("common.cancel", defaultValue: "Cancel"), role: .cancel) { pendingDelete = nil }
        } message: {
            if let real = pendingDelete {
                Text(L10n.string("realAccounts.deleteConfirm", defaultValue: "Delete real account “%@”?", real.name))
            }
        }
    }

    private func card(_ real: RealAccount) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let icon = real.icon, !icon.isEmpty {
                    Text(icon)
                        .font(.title3)
                }
                Text(real.name)
                    .font(.body.weight(.semibold))
                BadgeView(text: real.type.label, outlined: true)
                if real.isArchived {
                    BadgeView(text: L10n.string("status.archived", defaultValue: "Archived"), color: .orange)
                }
                Spacer()
                Text(Money.format(real.balance))
                    .font(.body.weight(.semibold).monospacedDigit())
                    .foregroundStyle(real.isArchived ? .secondary : Color.primary)
                RowMoreMenu {
                    realMenuItems(real)
                }
            }
            if real.pockets.isEmpty {
                Text(L10n.string("realAccounts.noPockets", defaultValue: "No linked pockets — link one from a ledger's accounts page."))
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text(L10n.string("realAccounts.linkedPockets", defaultValue: "Linked Pockets"))
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                    ForEach(real.pockets) { pocket in
                        HStack(spacing: 8) {
                            BadgeView(text: pocket.ledgerName, outlined: true)
                            Text(pocket.displayName)
                                .font(.caption)
                                .lineLimit(1)
                            Spacer()
                            Text(Money.format(pocket.balance))
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(
                                    pocket.ledgerStatus == "active" ? Color.primary : Color.secondary
                                )
                        }
                    }
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.primary.opacity(0.04)))
            }
        }
        .padding(12)
        .contentShape(Rectangle())
        .onTapGesture { editing = real }
        .contextMenu {
            realMenuItems(real)
        }
        .appCardRow()
    }

    /// Card actions shared by the long-press context menu and the trailing
    /// ellipsis menu.
    @ViewBuilder
    private func realMenuItems(_ real: RealAccount) -> some View {
        Button {
            editing = real
        } label: {
            Label(
                L10n.string("realAccounts.edit", defaultValue: "Edit"),
                systemImage: "pencil"
            )
        }
        Button {
            Task {
                do {
                    try await store.archiveToggle(real)
                    toast.show(
                        real.isArchived
                            ? L10n.string("realAccounts.unarchiveSuccess", defaultValue: "Real account unarchived")
                            : L10n.string("realAccounts.archiveSuccess", defaultValue: "Real account archived")
                    )
                } catch {
                    toast.show(error.localizedDescription)
                }
            }
        } label: {
            Label(
                L10n.string(
                    real.isArchived
                        ? L10n.Entry("realAccounts.unarchive", "Unarchive")
                        : .init("realAccounts.archive", "Archive")
                ),
                systemImage: real.isArchived ? "archivebox.fill" : "archivebox"
            )
        }
        Button(role: .destructive) {
            pendingDelete = real
        } label: {
            Label(
                L10n.string("realAccounts.delete", defaultValue: "Delete"),
                systemImage: "trash"
            )
        }
    }

    private func friendlyError(_ error: Error) -> String {
        let message = error.localizedDescription
        if message.range(of: "Unlink", options: .caseInsensitive) != nil {
            return L10n.string("realAccounts.hasPocketsError", defaultValue: "Unlink its ledger pockets first.")
        }
        return message
    }
}

/// Create/edit form for a real account.
struct RealAccountFormView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(RealAccountStore.self) private var store
    @Environment(ToastCenter.self) private var toast

    let real: RealAccount?

    @State private var name = ""
    @State private var type: AccountType = .asset
    @State private var icon = ""
    @State private var metaEntries: [MetaEntryRow] = []
    @State private var nameError: String?
    @State private var isSaving = false

    var body: some View {
        Form {
            Section {
                Picker(L10n.string("realAccounts.accountType", defaultValue: "Account Type"), selection: $type) {
                    Text(AccountType.asset.label).tag(AccountType.asset)
                    Text(AccountType.liability.label).tag(AccountType.liability)
                }
                .pickerStyle(.segmented)
                HStack {
                    Text(L10n.string("common.name", defaultValue: "Name"))
                    Spacer()
                    TextField(
                        L10n.string("realAccounts.namePlaceholder", defaultValue: "e.g. Chase Debit Card"),
                        text: $name
                    )
                        .multilineTextAlignment(.trailing)
                        .textFieldStyle(.plain)
                        .submitLabel(.done)
                        .onSubmit { dismissKeyboard() }
                }
                if let nameError {
                    Label(nameError, systemImage: "exclamationmark.circle")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
                HStack {
                    Text(L10n.string("common.icon", defaultValue: "Icon"))
                    Spacer()
                    TextField(L10n.string("realAccounts.iconPlaceholder", defaultValue: "Emoji, e.g. 🏦"), text: $icon)
                        .multilineTextAlignment(.trailing)
                        .textFieldStyle(.plain)
                        .submitLabel(.done)
                        .onSubmit { dismissKeyboard() }
                        #if os(iOS)
                        .frame(width: 160)
                        #endif
                }
            }

            Section {
                ForEach($metaEntries) { $entry in
                    VStack(alignment: .leading, spacing: 6) {
                        TextField(L10n.string("common.fieldLabel", defaultValue: "Label"), text: $entry.key)
                            .font(.subheadline)
                            .submitLabel(.done)
                            .onSubmit { dismissKeyboard() }
                        TextField(L10n.string("common.fieldValue", defaultValue: "Value"), text: $entry.value)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .submitLabel(.done)
                            .onSubmit { dismissKeyboard() }
                    }
                }
                .onDelete { metaEntries.remove(atOffsets: $0) }
                Button {
                    metaEntries.append(MetaEntryRow())
                } label: {
                    Label(L10n.string("common.addField", defaultValue: "Add Field"), systemImage: "plus")
                }
            } header: {
                Text(L10n.string("common.extraInfo", defaultValue: "Extra Info"))
            } footer: {
                Text(L10n.string("realAccounts.metaFooter", defaultValue: "Private details such as card numbers."))
            }
        }
        .navigationTitle(Text(real != nil ? L10n.string("realAccounts.editTitle", defaultValue: "Edit Real Account") : L10n.string("realAccounts.newTitle", defaultValue: "New Real Account")))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.string("common.cancel", defaultValue: "Cancel")) { dismiss() }
                    .disabled(isSaving)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(isSaving ? L10n.string("common.saving", defaultValue: "Saving…") : L10n.string("common.save", defaultValue: "Save")) {
                    Task { await save() }
                }
                .disabled(isSaving)
            }
        }
        .onAppear {
            if let real {
                name = real.name
                type = real.type
                icon = real.icon ?? ""
                metaEntries = real.metaFormRows
            }
        }
    }

    private func save() async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            nameError = L10n.string("realAccounts.nameRequired", defaultValue: "Name is required")
            return
        }
        nameError = nil

        var meta: [String: JSONValue] = [:]
        for entry in metaEntries {
            let key = entry.key.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !key.isEmpty else { continue }
            if let raw = entry.raw, raw.editableString == entry.value {
                meta[key] = raw
            } else {
                meta[key] = .string(entry.value)
            }
        }

        isSaving = true
        defer { isSaving = false }
        do {
            if let real {
                try await store.update(real, name: trimmed, icon: icon.isEmpty ? nil : icon, meta: meta.isEmpty ? nil : meta)
                toast.show(L10n.string("realAccounts.updateSuccess", defaultValue: "Real account updated"))
            } else {
                try await store.create(name: trimmed, type: type, icon: icon.isEmpty ? nil : icon, meta: meta.isEmpty ? nil : meta)
                toast.show(L10n.string("realAccounts.createSuccess", defaultValue: "Real account created"))
            }
            dismiss()
        } catch {
            toast.show(error.localizedDescription)
        }
    }
}
