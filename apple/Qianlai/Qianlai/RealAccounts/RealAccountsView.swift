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
            } else if let error = store.loadError, store.realAccounts.isEmpty {
                ErrorRetryView(message: error) {
                    Task { await store.load() }
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            } else {
                Section {
                    HStack(spacing: 10) {
                        StatCard(icon: "wallet.pass", label: "Assets", value: store.totals?.assets)
                        StatCard(icon: "banknote", label: "Liabilities", value: store.totals?.liabilities)
                    }
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                    StatCard(
                        icon: "building.columns",
                        label: "Net Worth",
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
                    Text("Real Accounts")
                } footer: {
                    Text("Real accounts track real-world wallets across ledgers. Link them to ledger accounts on the accounts page. Visible only to you.")
                }
            }
        }
        .navigationTitle(Text("Assets"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    isShowingCreate = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(Text("New Real Account"))
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
            Button("Delete", role: .destructive) {
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
            Button("Cancel", role: .cancel) { pendingDelete = nil }
        } message: {
            if let real = pendingDelete {
                Text("Delete real account “\(real.name)”?")
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
            }
            if real.pockets.isEmpty {
                Text("No linked pockets — link one from a ledger's accounts page.")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Linked Pockets")
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
            Button {
                editing = real
            } label: {
                Label("Edit", systemImage: "pencil")
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
                    real.isArchived ? "Unarchive" : "Archive",
                    systemImage: real.isArchived ? "archivebox.fill" : "archivebox"
                )
            }
            Button(role: .destructive) {
                pendingDelete = real
            } label: {
                Label("Delete", systemImage: "trash")
            }
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
                Picker("Account Type", selection: $type) {
                    Text(AccountType.asset.label).tag(AccountType.asset)
                    Text(AccountType.liability.label).tag(AccountType.liability)
                }
                .pickerStyle(.segmented)
                HStack {
                    Text("Name")
                    Spacer()
                    TextField("e.g. CMB Savings Card", text: $name)
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
                    Text("Icon")
                    Spacer()
                    TextField("Emoji, e.g. 🏦", text: $icon)
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
                        TextField("Label", text: $entry.key)
                            .font(.subheadline)
                            .submitLabel(.done)
                            .onSubmit { dismissKeyboard() }
                        TextField("Value", text: $entry.value)
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
                    Label("Add Field", systemImage: "plus")
                }
            } header: {
                Text("Extra Info")
            } footer: {
                Text("Private details such as card numbers.")
            }
        }
        .navigationTitle(Text(real != nil ? "Edit Real Account" : "New Real Account"))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
                    .disabled(isSaving)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(isSaving ? "Saving…" : "Save") {
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
