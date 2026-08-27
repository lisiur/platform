//
//  LedgersView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// Ledger management: create, join by share code, edit, set default,
/// archive/unarchive, delete, leave, and open the members manager.
struct LedgersView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ToastCenter.self) private var toast
    @State private var editingLedger: QianlaiLedger?
    @State private var isShowingCreate = false
    @State private var isShowingJoin = false
    @State private var membersLedger: QianlaiLedger?
    @State private var ledgerPendingDelete: QianlaiLedger?
    @State private var ledgerPendingLeave: QianlaiLedger?

    var body: some View {
        List {
            if ledgerStore.isLoading, ledgerStore.ledgers.isEmpty {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .listRowSeparator(.hidden)
            } else if let error = ledgerStore.loadError, ledgerStore.ledgers.isEmpty {
                ErrorRetryView(message: error) {
                    Task { await ledgerStore.load() }
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            } else if ledgerStore.ledgers.isEmpty {
                EmptyStateView(
                    message: L10n.string("ledgers.empty", defaultValue: "No ledgers yet. Create one or join with a share code."),
                    systemImage: "book"
                )
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            } else {
                Section {
                    ForEach(ledgerStore.activeLedgers) { ledger in
                        row(ledger)
                    }
                }
                if !ledgerStore.archivedLedgers.isEmpty {
                    Section("Archived") {
                        ForEach(ledgerStore.archivedLedgers) { ledger in
                            row(ledger)
                        }
                    }
                }
            }
        }
        .navigationTitle(Text("Ledgers"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    isShowingCreate = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(Text("Create Ledger"))
            }
            ToolbarItem(placement: .navigation) {
                Button("Join") { isShowingJoin = true }
            }
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") { dismiss() }
            }
        }
        .task {
            await ledgerStore.load()
        }
        .sheet(isPresented: $isShowingCreate) {
            NavigationStack {
                LedgerFormView(ledger: nil)
            }
        }
        .sheet(item: $editingLedger) { ledger in
            NavigationStack {
                LedgerFormView(ledger: ledger)
            }
        }
        .sheet(isPresented: $isShowingJoin) {
            NavigationStack {
                JoinLedgerView()
            }
        }
        .sheet(item: $membersLedger) { ledger in
            NavigationStack {
                MembersView(ledger: ledger)
            }
        }
        .alert(
            L10n.string("ledgers.delete", defaultValue: "Delete"),
            isPresented: Binding(
                get: { ledgerPendingDelete != nil },
                set: { if !$0 { ledgerPendingDelete = nil } }
            )
        ) {
            Button("Delete", role: .destructive) {
                if let ledger = ledgerPendingDelete {
                    Task {
                        do {
                            try await ledgerStore.delete(ledger)
                            toast.show(L10n.string("ledgers.deleteSuccess", defaultValue: "Ledger deleted"))
                        } catch {
                            toast.show(error.localizedDescription)
                        }
                    }
                }
                ledgerPendingDelete = nil
            }
            Button("Cancel", role: .cancel) { ledgerPendingDelete = nil }
        } message: {
            if let ledger = ledgerPendingDelete {
                Text("Delete “\(ledger.name)”? Its accounts, entries, and members will be permanently removed.")
            }
        }
        .alert(
            L10n.string("ledgers.leave", defaultValue: "Leave Ledger"),
            isPresented: Binding(
                get: { ledgerPendingLeave != nil },
                set: { if !$0 { ledgerPendingLeave = nil } }
            )
        ) {
            Button(L10n.string("ledgers.leave", defaultValue: "Leave"), role: .destructive) {
                if let ledger = ledgerPendingLeave {
                    Task {
                        do {
                            try await ledgerStore.leave(ledger)
                            toast.show(L10n.string("ledgers.leaveSuccess", defaultValue: "You left the ledger"))
                        } catch {
                            toast.show(error.localizedDescription)
                        }
                    }
                }
                ledgerPendingLeave = nil
            }
            Button("Cancel", role: .cancel) { ledgerPendingLeave = nil }
        } message: {
            Text("Leave this ledger? Rejoining requires a new share code.")
        }
    }

    private func row(_ ledger: QianlaiLedger) -> some View {
        let isActive = ledger.id == ledgerStore.activeLedger?.id
        let isOwner = ledger.myRole == .owner
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                if ledger.isDefault {
                    Image(systemName: "star.fill")
                        .font(.caption)
                        .foregroundStyle(.yellow)
                }
                Text(ledger.name)
                    .font(.body.weight(.medium))
                if ledger.shared {
                    BadgeView(text: L10n.string("ledgers.shared", defaultValue: "Shared"), outlined: true)
                }
                Spacer()
                if isActive {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.accentColor)
                }
            }
            HStack(spacing: 8) {
                Text(ledger.currency)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                Text(ledger.myRole.label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Label("\(ledger.membersCount)", systemImage: "person.2")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if ledger.isArchived {
                    BadgeView(text: L10n.string("status.archived", defaultValue: "Archived"), color: .orange)
                }
            }
            if let description = ledger.description, !description.isEmpty {
                Text(description)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .onTapGesture {
            ledgerStore.setActive(ledger.id)
        }
        .contextMenu {
            Button {
                membersLedger = ledger
            } label: {
                Label("Members", systemImage: "person.2")
            }
            if isOwner {
                Button {
                    editingLedger = ledger
                } label: {
                    Label("Edit", systemImage: "pencil")
                }
                if !ledger.isDefault {
                    Button {
                        Task {
                            do {
                                try await ledgerStore.setDefault(ledger)
                                toast.show(L10n.string("ledgers.updateSuccess", defaultValue: "Ledger updated"))
                            } catch {
                                toast.show(error.localizedDescription)
                            }
                        }
                    } label: {
                        Label("Set as Default", systemImage: "star")
                    }
                }
                Button {
                    Task {
                        do {
                            try await ledgerStore.archiveToggle(ledger)
                            toast.show(
                                ledger.isActive
                                    ? L10n.string("ledgers.archiveSuccess", defaultValue: "Ledger archived")
                                    : L10n.string("ledgers.unarchiveSuccess", defaultValue: "Ledger unarchived")
                            )
                        } catch {
                            toast.show(error.localizedDescription)
                        }
                    }
                } label: {
                    Label(
                        ledger.isActive ? "Archive" : "Unarchive",
                        systemImage: ledger.isActive ? "archivebox" : "archivebox.fill"
                    )
                }
                Button(role: .destructive) {
                    ledgerPendingDelete = ledger
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            } else {
                Button(role: .destructive) {
                    ledgerPendingLeave = ledger
                } label: {
                    Label("Leave", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        }
    }
}

/// Create/edit ledger form. Currency is a 3-letter code (default CNY).
struct LedgerFormView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ToastCenter.self) private var toast

    let ledger: QianlaiLedger?

    @State private var name = ""
    @State private var description = ""
    @State private var currency = "CNY"
    @State private var nameError: String?
    @State private var isSaving = false

    private let currencies = ["CNY", "USD", "EUR", "JPY", "GBP", "HKD", "TWD", "SGD", "KRW", "AUD", "CAD", "CHF"]

    var body: some View {
        Form {
            Section {
                FormField(title: "Name", error: nameError) {
                    TextField("e.g. Family, Travel 2026", text: $name)
                        .textFieldStyle(.plain)
                        .submitLabel(.done)
                        .onSubmit { dismissKeyboard() }
                }
                .listRowBackground(Color.clear)
                TextField("Description (optional)", text: $description, axis: .vertical)
                Picker("Currency", selection: $currency) {
                    ForEach(currencies, id: \.self) { code in
                        Text(code).tag(code)
                    }
                }
            } footer: {
                if ledger == nil {
                    Text("A starter chart of accounts is seeded automatically.")
                }
            }
        }
        .navigationTitle(Text(ledger != nil ? "Edit Ledger" : "Create Ledger"))
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
            if let ledger {
                name = ledger.name
                description = ledger.description ?? ""
                currency = ledger.currency
            }
        }
    }

    private func save() async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            nameError = L10n.string("ledgers.nameRequired", defaultValue: "Ledger name is required")
            return
        }
        nameError = nil
        isSaving = true
        defer { isSaving = false }
        do {
            if let ledger {
                try await ledgerStore.update(
                    ledger,
                    name: trimmed,
                    description: description.isEmpty ? nil : description,
                    currency: currency
                )
                toast.show(L10n.string("ledgers.updateSuccess", defaultValue: "Ledger updated"))
            } else {
                try await ledgerStore.create(
                    name: trimmed,
                    description: description.isEmpty ? nil : description,
                    currency: currency
                )
                toast.show(L10n.string("ledgers.createSuccess", defaultValue: "Ledger created"))
            }
            dismiss()
        } catch {
            toast.show(error.localizedDescription)
        }
    }
}

/// Join someone else's ledger by pasting a share code.
struct JoinLedgerView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ToastCenter.self) private var toast

    @State private var code = ""
    @State private var error: String?
    @State private var isJoining = false
    @FocusState private var isCodeFocused: Bool

    var body: some View {
        Form {
            Section {
                FormField(title: "Share Code", error: nil) {
                    TextField("e.g. A2B4C6D8E9F2", text: $code)
                        .textFieldStyle(.plain)
                        #if os(iOS)
                        .textInputAutocapitalization(.characters)
                        #endif
                        .autocorrectionDisabled()
                        .focused($isCodeFocused)
                        .submitLabel(.done)
                        .onSubmit { dismissKeyboard() }
                }
                .listRowBackground(Color.clear)
            } header: {
                Text("Join a Ledger")
            } footer: {
                Text("Paste a share code from the ledger owner to join as an editor or viewer.")
            }
            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                        .font(.footnote)
                }
            }
        }
        .navigationTitle(Text("Join"))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
                    .disabled(isJoining)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(isJoining ? "Joining…" : "Join") {
                    Task { await join() }
                }
                .disabled(isJoining || code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .onAppear { isCodeFocused = true }
    }

    private func join() async {
        isCodeFocused = false
        isJoining = true
        defer { isJoining = false }
        do {
            let ledgerId = try await ledgerStore.join(code: code)
            ledgerStore.setActive(ledgerId)
            toast.show(L10n.string("ledgers.joinSuccess", defaultValue: "Joined the ledger"))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
