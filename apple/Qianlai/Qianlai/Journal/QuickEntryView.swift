//
//  QuickEntryView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// One-click income/expense/transfer entry: pick a scenario, two accounts,
/// and a single amount — the draft expands into the balanced two-line double
/// entry the API expects.
struct QuickEntryView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ToastCenter.self) private var toast
    @State private var accountStore = AccountStore()
    @State private var memberStore = MemberStore()
    @State private var journalStore = JournalStore()
    @State private var draft = QuickEntryDraft()
    @State private var amountText = ""
    @State private var validationError: String?
    @State private var isPosting = false

    var body: some View {
        Form {
            Section {
                Picker("Account Type", selection: $draft.kind) {
                    ForEach(QuickEntryKind.allCases) { kind in
                        Text(kind.label).tag(kind)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: draft.kind) {
                    // Both sides restart unselected when the scenario changes.
                    draft.debitAccountId = nil
                    draft.creditAccountId = nil
                    validationError = nil
                }
            }

            Section {
                HStack {
                    Text("Amount")
                    Spacer()
                    TextField("0.00", text: $amountText)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                        .multilineTextAlignment(.trailing)
                        .font(.body.monospacedDigit())
                        .textFieldStyle(.plain)
                        #if os(macOS)
                        .frame(width: 140)
                        #endif
                }
                DatePicker(
                    "Date",
                    selection: $draft.date,
                    displayedComponents: .date
                )
            }

            Section {
                accountPicker(
                    title: debitLabel,
                    selection: $draft.debitAccountId,
                    entries: debitEntries,
                    optional: draft.kind == .income
                )
                accountPicker(
                    title: creditLabel,
                    selection: $draft.creditAccountId,
                    entries: creditEntries,
                    optional: draft.kind == .expense
                )
                if draft.isSameAccount {
                    Label(
                        "The transfer's origin and destination can't be the same account.",
                        systemImage: "exclamationmark.triangle"
                    )
                    .font(.caption)
                    .foregroundStyle(.orange)
                }
            } header: {
                Text("Accounts")
            }

            Section {
                TextField("Memo (e.g. weekly groceries)", text: $draft.memo)
            }

            if !memberStore.members.isEmpty {
                Section {
                    ForEach(memberStore.members) { member in
                        Button {
                            toggleParticipant(member)
                        } label: {
                            HStack {
                                Text(member.displayName)
                                    .foregroundStyle(.primary)
                                Spacer()
                                if draft.participants.contains(member.id) {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(Color.accentColor)
                                }
                            }
                        }
                    }
                } header: {
                    Text("Participants")
                } footer: {
                    Text("Member turnover reports aggregate every entry a member is tagged on.")
                }
            }

            if let validationError {
                Section {
                    Label(validationError, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                        .font(.footnote)
                }
            }
        }
        .navigationTitle(Text("Add Entry"))
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(isPosting ? "Posting…" : "Save") {
                    Task { await post() }
                }
                .disabled(isPosting || draft.isSameAccount)
            }
        }
        .disabled(!canPost)
        .overlay {
            if !canPost {
                ContentUnavailableView(
                    "Read-only ledger",
                    systemImage: "lock",
                    description: Text("Editor access or higher is required to post entries.")
                )
            }
        }
        .task {
            guard let ledger = ledgerStore.activeLedger else { return }
            await accountStore.load(ledgerId: ledger.id)
            await memberStore.load(ledgerId: ledger.id, myUserId: nil)
        }
    }

    private var canPost: Bool {
        ledgerStore.activeLedger?.canPost ?? false
    }

    // Debit side = where value goes (expense category / receiving pocket /
    // transfer destination); credit side = where it comes from (paying
    // pocket / income source / transfer origin).
    private var debitLabel: String {
        switch draft.kind {
        case .expense: L10n.string("quick.expenseCategory", defaultValue: "Expense Category")
        case .income: L10n.string("quick.receiveAccount", defaultValue: "Receive Into")
        case .transfer: L10n.string("quick.toAccount", defaultValue: "To")
        }
    }

    private var creditLabel: String {
        switch draft.kind {
        case .expense: L10n.string("quick.payAccount", defaultValue: "Pay From")
        case .income: L10n.string("quick.incomeCategory", defaultValue: "Income Category")
        case .transfer: L10n.string("quick.fromAccount", defaultValue: "From")
        }
    }

    /// Category sides render as a tree (parents before indented children);
    /// pocket sides are flat.
    private var debitEntries: [AccountTreeEntry] {
        switch draft.kind {
        case .expense:
            AccountTreeEntry.build(accountStore.pickable.filter { $0.type == .expense })
        case .income:
            accountStore.pickable
                .filter { $0.type == .asset }
                .map { AccountTreeEntry(account: $0, depth: 0) }
        case .transfer:
            accountStore.assetLike.map { AccountTreeEntry(account: $0, depth: 0) }
        }
    }

    private var creditEntries: [AccountTreeEntry] {
        switch draft.kind {
        case .expense:
            accountStore.assetLike.map { AccountTreeEntry(account: $0, depth: 0) }
        case .income:
            AccountTreeEntry.build(accountStore.pickable.filter { $0.type == .income })
        case .transfer:
            accountStore.assetLike.map { AccountTreeEntry(account: $0, depth: 0) }
        }
    }

    /// Pocket sides may stay unselected — the backend then falls back to the
    /// ledger's flagged default pocket for that side.
    @ViewBuilder
    private func accountPicker(
        title: String,
        selection: Binding<String?>,
        entries: [AccountTreeEntry],
        optional: Bool
    ) -> some View {
        Picker(selection: selection) {
            if optional {
                Text("Not selected").tag(String?.none)
            }
            ForEach(entries) { entry in
                Text(String(repeating: "    ", count: entry.depth) + entry.account.displayName)
                    .tag(String?.some(entry.account.id))
            }
        } label: {
            Text(title)
        }
    }

    private func toggleParticipant(_ member: LedgerMember) {
        if draft.participants.contains(member.id) {
            draft.participants.remove(member.id)
        } else {
            draft.participants.insert(member.id)
        }
    }

    private func post() async {
        let normalized = amountText.replacingOccurrences(of: ",", with: ".")
        guard let amount = Double(normalized), amount > 0 else {
            validationError = L10n.string("quick.amountRequired", defaultValue: "Enter an amount greater than 0.")
            return
        }
        draft.amount = amount
        guard draft.isValid else {
            validationError = L10n.string("quick.accountRequired", defaultValue: "Please pick the required account(s).")
            return
        }
        validationError = nil
        isPosting = true
        defer { isPosting = false }
        do {
            try await journalStore.post(draft)
            toast.show(L10n.string("journal.createSuccess", defaultValue: "Entry posted"))
            dismiss()
        } catch {
            validationError = error.localizedDescription
        }
    }
}
