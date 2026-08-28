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
    @Environment(JournalStore.self) private var journalStore
    @Environment(ReportStore.self) private var reportStore
    @State private var accountStore = AccountStore()
    @State private var memberStore = MemberStore()
    @State private var draft = QuickEntryDraft()
    @State private var amountText = ""
    @State private var isCalculatorPresented = false
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
                // Tapping Amount opens the calculator sheet instead of the
                // keyboard: multi-step math (splits, discounts) is the norm
                // for entry amounts, so the pad doubles as the editor.
                Button {
                    isCalculatorPresented = true
                } label: {
                    HStack {
                        Text("Amount")
                        Spacer()
                        Text(amountText.isEmpty ? "0.00" : amountText)
                            .foregroundStyle(amountText.isEmpty ? Color.secondary : Color.primary)
                            .font(.body.monospacedDigit())
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                DatePicker(
                    "Date",
                    selection: $draft.date,
                    displayedComponents: [.date, .hourAndMinute]
                )
            }

            Section {
                accountField(
                    title: debitLabel,
                    selection: $draft.debitAccountId,
                    entries: debitEntries,
                    allowsEmpty: draft.kind == .income
                )
                accountField(
                    title: creditLabel,
                    selection: $draft.creditAccountId,
                    entries: creditEntries,
                    allowsEmpty: draft.kind == .expense
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
                    .submitLabel(.done)
                    .onSubmit { dismissKeyboard() }
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
                        .buttonStyle(.plain)
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

            Section {
                Button {
                    Task { await post() }
                } label: {
                    Group {
                        if isPosting {
                            HStack(spacing: 8) {
                                ProgressView()
                                    .controlSize(.small)
                                Text("Posting…")
                            }
                        } else {
                            Text("Save")
                        }
                    }
                    .font(.body.weight(.medium))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 36)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.regular)
                .disabled(isPosting || draft.isSameAccount)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        }
        .navigationTitle(Text("Add Entry"))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
        }
        .sheet(isPresented: $isCalculatorPresented) {
            CalculatorSheet(initialAmount: amountText) { amountText = $0 }
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

    /// Field row that pushes `AccountSelectionView`: the tree of accounts is
    /// too large for an inline menu, so the form only shows the current value
    /// and the full hierarchy opens on tap.
    private func accountField(
        title: String,
        selection: Binding<String?>,
        entries: [AccountTreeEntry],
        allowsEmpty: Bool
    ) -> some View {
        NavigationLink {
            AccountSelectionView(
                title: title,
                entries: entries,
                allowsEmpty: allowsEmpty,
                selection: selection
            )
        } label: {
            HStack {
                Text(title)
                Spacer()
                Text(accountValue(entries, selection.wrappedValue))
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// The selected account's display name, or the "Not selected" sentinel —
    /// never a blank trailing label.
    private func accountValue(_ entries: [AccountTreeEntry], _ selected: String?) -> String {
        guard let selected,
              let entry = entries.first(where: { $0.account.id == selected })
        else { return L10n.string("Not selected", defaultValue: "Not selected") }
        return entry.account.displayName
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
            // The posting moved balances; refresh dashboard and reports in
            // the background so they never show stale numbers.
            Task { await reportStore.refreshAfterPosting() }
        } catch {
            validationError = error.localizedDescription
        }
    }
}
