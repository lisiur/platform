//
//  QuickEntryView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

/// One-click income/expense/transfer entry: pick a scenario, two accounts,
/// and a single amount — the draft expands into the balanced two-line double
/// entry the API expects. Pass an `entry` to edit it instead: every field is
/// prefilled and saving issues a full replace of the entry.
struct QuickEntryView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ToastCenter.self) private var toast
    @Environment(JournalStore.self) private var journalStore
    @Environment(ReportStore.self) private var reportStore
    private let editedEntry: JournalEntry?
    @State private var draft: QuickEntryDraft
    @State private var amountText: String
    @State private var isCalculatorPresented = false
    /// The pad lives in the form itself on open — no second sheet waiting
    /// for this one to land — and hands off to the sheet after first commit.
    /// Editing skips the pad: the amount is already committed.
    @State private var isAmountPadVisible: Bool
    @State private var isParticipantsPresented = false
    @State private var activeAccountSide: AccountSide?
    @State private var validationError: String?
    @State private var isPosting = false

    /// Editing seeds every field from the entry; creating starts blank with
    /// the amount pad up.
    init(entry: JournalEntry? = nil) {
        editedEntry = entry
        _draft = State(initialValue: entry.map { QuickEntryDraft(entry: $0) } ?? QuickEntryDraft())
        // No grouping separator so post()'s Double parsing round-trips.
        _amountText = State(initialValue: entry.map { String(format: "%.2f", $0.amount) } ?? "")
        _isAmountPadVisible = State(initialValue: entry == nil)
    }

    @State private var accountStore = AccountStore()
    @State private var memberStore = MemberStore()
    @State private var projectStore = ProjectStore()

    /// Whether the viewer is a guest on this ledger — restricts to expense
    /// entries inside their projects (kind picker and pay-side account row
    /// are hidden, project assignment is mandatory).
    private var isGuest: Bool {
        ledgerStore.activeLedger?.isGuest ?? false
    }

    /// Which side's account picker the sheet is showing — one presentation
    /// state serves both fields.
    private enum AccountSide: String, Identifiable {
        case debit, credit

        var id: String { rawValue }
    }

    var body: some View {
        Form {
            leadSections
            if isAmountPadVisible {
                // First-run amount entry: everything after the pad stays
                // hidden until the amount is committed.
                Section {
                    CalculatorPad(initialAmount: amountText) { committed in
                        amountText = committed
                        isAmountPadVisible = false
                    }
                    .frame(maxWidth: 420)
                    .frame(maxWidth: .infinity)
                }
            } else {
                trailingSections
            }
        }
        .navigationTitle(Text(editedEntry == nil ? "Add Entry" : "Edit Entry"))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
        }
        .sheet(isPresented: $isCalculatorPresented) {
            CalculatorSheet(initialAmount: amountText) { amountText = $0 }
        }
        .sheet(item: $activeAccountSide) { side in
            NavigationStack {
                AccountSelectionView(
                    title: side == .debit ? debitLabel : creditLabel,
                    entries: side == .debit ? debitEntries : creditEntries,
                    allowsEmpty: side == .debit
                        ? draft.kind == .income
                        : draft.kind == .expense,
                    selection: side == .debit
                        ? $draft.debitAccountId
                        : $draft.creditAccountId
                )
            }
            #if os(iOS)
            .presentationDetents([.medium, .large])
            #endif
        }
        .sheet(isPresented: $isParticipantsPresented) {
            ParticipantSelectionView(
                members: memberStore.members,
                selection: $draft.participants
            )
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
            await projectStore.load(ledgerId: ledger.id)
            applyExpenseCategoryDefault()
            applyGuestProjectDefault()
        }
    }

    /// The fields that lead every layout: scenario, then amount and date.
    @ViewBuilder
    private var leadSections: some View {
        // Guests are scoped to expense-only entries; the kind picker is hidden
        // and `draft.kind` stays at its default (`.expense`).
        if !isGuest {
            Section {
                Picker("Account Type", selection: $draft.kind) {
                    ForEach(QuickEntryKind.allCases) { kind in
                        Text(kind.label).tag(kind)
                    }
                }
                .pickerStyle(.segmented)
                .controlSize(.large)
                .onChange(of: draft.kind) {
                    // Both sides restart unselected when the scenario changes.
                    draft.debitAccountId = nil
                    draft.creditAccountId = nil
                    validationError = nil
                    applyExpenseCategoryDefault()
                }
            }
            // Floating segmented control: no grouped card around the tabs.
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
        }

        Section {
            // Reopens the calculator as a sheet for edits — while the inline
            // pad is up it already owns amount entry, so the row is inert.
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
            .disabled(isAmountPadVisible)
            DatePicker(
                "Date",
                selection: $draft.date,
                displayedComponents: [.date, .hourAndMinute]
            )
        }
    }

    /// Everything after the amount is committed: accounts, memo,
    /// participants, and the save action.
    @ViewBuilder
    private var trailingSections: some View {
        if !isGuest, !projectStore.projects.isEmpty {
            Section {
                Picker("Project", selection: Binding(
                    get: { draft.projectId ?? "" },
                    set: { draft.projectId = $0.isEmpty ? nil : $0 }
                )) {
                    Text("Personal").tag("")
                    ForEach(projectStore.projects) { project in
                        Text(project.name).tag(project.id)
                    }
                }
            }
        }

        Section {
            // The required side leads: for income the category is required
            // and comes first, with the optional "Receive Into" trailing.
            // Guests are expense-only: their "Pay From" side falls back to
            // the ledger's default pocket on the server, so the row is hidden.
            if isGuest {
                accountField(
                    title: debitLabel,
                    side: .debit,
                    selection: $draft.debitAccountId,
                    entries: debitEntries
                )
            } else if draft.kind == .income {
                accountField(
                    title: creditLabel,
                    side: .credit,
                    selection: $draft.creditAccountId,
                    entries: creditEntries
                )
                accountField(
                    title: debitLabel,
                    side: .debit,
                    selection: $draft.debitAccountId,
                    entries: debitEntries
                )
            } else {
                accountField(
                    title: debitLabel,
                    side: .debit,
                    selection: $draft.debitAccountId,
                    entries: debitEntries
                )
                accountField(
                    title: creditLabel,
                    side: .credit,
                    selection: $draft.creditAccountId,
                    entries: creditEntries
                )
            }
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
                // Opens the participant sheet instead of listing members
                // inline: the form stays compact once a ledger grows.
                Button {
                    isParticipantsPresented = true
                } label: {
                    HStack {
                        Text("Participants")
                        Spacer()
                        Text(participantSummary)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
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
                Task { await save() }
            } label: {
                Group {
                    if isPosting {
                        HStack(spacing: 8) {
                            ProgressView()
                                .controlSize(.small)
                            Text(editedEntry == nil ? "Posting…" : "Saving…")
                        }
                    } else {
                        Text(editedEntry == nil ? "Save" : "Update")
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

    /// The expense category to prefill: the one on the most recent expense
    /// entry in the journal — repeated spending is the common case — falling
    /// back to the first category in picker order for a fresh ledger.
    private var defaultExpenseCategoryId: String? {
        let categories = AccountTreeEntry.build(accountStore.pickable.filter { $0.type == .expense })
        let categoryIds = Set(categories.map(\.account.id))
        // Entries are newest-first; the debit line of an expense is its category.
        for entry in journalStore.entries {
            if let line = entry.lines.first(where: { $0.debit > 0 && categoryIds.contains($0.accountId) }) {
                return line.accountId
            }
        }
        return categories.first?.account.id
    }

    /// Seeds the expense category once accounts are in; an explicit pick is
    /// never overwritten, and no-op for the other scenarios.
    private func applyExpenseCategoryDefault() {
        guard draft.kind == .expense, draft.debitAccountId == nil else { return }
        draft.debitAccountId = defaultExpenseCategoryId
    }

    /// A guest's only project pre-fills the assignment so they only have to
    /// pick the category and the amount. Multiple projects stay unassigned
    /// until the guest explicitly chooses one (validated server-side too).
    private func applyGuestProjectDefault() {
        guard isGuest, draft.projectId == nil, projectStore.projects.count == 1 else { return }
        draft.projectId = projectStore.projects[0].id
    }

    /// Field row that opens the account picker as a bottom sheet: the tree
    /// of accounts is too large for an inline menu, so the form only shows
    /// the current value and the full hierarchy opens on tap.
    private func accountField(
        title: String,
        side: AccountSide,
        selection: Binding<String?>,
        entries: [AccountTreeEntry]
    ) -> some View {
        Button {
            activeAccountSide = side
        } label: {
            HStack {
                Text(title)
                Spacer()
                accountValue(entries, selection.wrappedValue)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// The selected account's icon + display name — the icon mirrors the
    /// picker rows so the value reads the same in both places — or the
    /// "Not selected" sentinel; never a blank trailing label.
    @ViewBuilder
    private func accountValue(_ entries: [AccountTreeEntry], _ selected: String?) -> some View {
        if let selected,
           let entry = entries.first(where: { $0.account.id == selected }) {
            HStack(spacing: 8) {
                if let icon = entry.account.icon, !icon.isEmpty {
                    Text(icon)
                }
                Text(entry.account.displayName)
            }
            .foregroundStyle(.secondary)
        } else {
            Text(L10n.string("Not selected", defaultValue: "Not selected"))
                .foregroundStyle(.secondary)
        }
    }

    /// Trailing label of the Participants row: selected names, or the
    /// "Not selected" sentinel — never a blank trailing label.
    private var participantSummary: String {
        let names = memberStore.members
            .filter { draft.participants.contains($0.id) }
            .map(\.displayName)
        guard !names.isEmpty else {
            return L10n.string("Not selected", defaultValue: "Not selected")
        }
        return names.joined(separator: ", ")
    }

    private func save() async {
        let normalized = amountText.replacingOccurrences(of: ",", with: ".")
        guard let amount = Double(normalized), amount > 0 else {
            validationError = L10n.string("quick.amountRequired", defaultValue: "Enter an amount greater than 0.")
            return
        }
        draft.amount = amount
        if isGuest, draft.projectId == nil {
            validationError = L10n.string("quick.projectRequired", defaultValue: "Choose a project.")
            return
        }
        guard draft.isValid else {
            validationError = L10n.string("quick.accountRequired", defaultValue: "Please pick the required account(s).")
            return
        }
        validationError = nil
        isPosting = true
        defer { isPosting = false }
        do {
            if let editedEntry {
                try await journalStore.update(editedEntry, draft: draft)
                toast.show(L10n.string("journal.updateSuccess", defaultValue: "Entry updated"))
            } else {
                try await journalStore.post(draft)
                toast.show(L10n.string("journal.createSuccess", defaultValue: "Entry posted"))
            }
            dismiss()
            // The posting moved balances; refresh dashboard and reports in
            // the background so they never show stale numbers.
            Task { await reportStore.refreshAfterPosting() }
        } catch {
            validationError = error.localizedDescription
        }
    }
}
