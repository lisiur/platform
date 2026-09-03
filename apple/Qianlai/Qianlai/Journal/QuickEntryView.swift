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
    /// The calculator engine doubles as the amount field: the inline
    /// `CalculatorView` — display and keypad as one unit — mutates it
    /// through a binding, so every edit applies immediately.
    @State private var engine: CalculatorEngine
    @State private var isParticipantsPresented = false
    @State private var activeAccountSide: AccountSide?
    @State private var validationError: String?
    @State private var isPosting = false
    /// Place chosen on the location picker map; its result is copied into
    /// the draft.
    @State private var isLocationPickerPresented = false
    /// Ledger the scoped stores were last loaded for — lets the task tell
    /// the initial load apart from a switcher tap inside the sheet.
    @State private var loadedLedgerId: String?

    /// Editing seeds every field from the entry; creating starts blank.
    init(entry: JournalEntry? = nil) {
        editedEntry = entry
        _draft = State(initialValue: entry.map { QuickEntryDraft(entry: $0) } ?? QuickEntryDraft())
        // No grouping separator so post()'s Double parsing round-trips.
        _engine = State(initialValue: CalculatorEngine(initialText: entry.map { String(format: "%.2f", $0.amount) } ?? ""))
    }

    @State private var accountStore = AccountStore()
    @State private var memberStore = MemberStore()
    @State private var projectStore = ProjectStore()
    /// The app-level project store that owns the ledger switcher's scope —
    /// distinct from the local `projectStore` above, which only feeds this
    /// sheet's picker. A project scoped there pins new entries to itself.
    @Environment(ProjectStore.self) private var appProjectStore

    /// Whether the viewer is a guest on this ledger — restricts to expense
    /// entries inside their projects (kind picker and pay-side account row
    /// are hidden, project assignment is mandatory).
    private var isGuest: Bool {
        ledgerStore.activeLedger?.isGuest ?? false
    }

    /// The project currently claiming scope in the ledger switcher — an
    /// explicit selection for any role, the auto-picked first project for
    /// guests. Non-nil fixes new entries to it in place of the picker.
    private var scopedProject: QianlaiProject? {
        guard let ledger = ledgerStore.activeLedger else { return nil }
        return appProjectStore.scopedProject(in: ledger.id, isGuestLedger: ledger.isGuest)
    }

    /// Who can be tagged on this entry. When the entry targets a project
    /// (mandatory for guests), only that project's members are eligible —
    /// each project member is resolved to their ledger membership so the
    /// posted `participantMemberIds` stay ledger-scoped (the API keys
    /// participants by ledger membership, not by project membership).
    /// Personal entries fall back to the whole ledger roster.
    private var participantCandidates: [LedgerMember] {
        if let projectId = draft.projectId,
           let project = projectStore.projects.first(where: { $0.id == projectId }) {
            let memberUserIds = Set(project.members.map(\.userId))
            return memberStore.members.filter { memberUserIds.contains($0.userId) }
        }
        return memberStore.members
    }

    /// Which side's account picker the sheet is showing — one presentation
    /// state serves both fields.
    private enum AccountSide: String, Identifiable {
        case debit, credit

        var id: String { rawValue }
    }

    var body: some View {
        // Zero spacing: the form and the calculator must sit flush, or the
        // sheet's white background would peek through as a strip between
        // the form's canvas and the calculator's top border.
        VStack(spacing: 0) {
            // Guests are scoped to expense-only entries; the kind picker is
            // hidden and `draft.kind` stays at its default (`.expense`).
            if !isGuest {
                // Pinned above the form: grouped lists reserve a built-in
                // top margin for the first section that no public config
                // removes, so the tabs live outside the form — flush under
                // the title.
                Picker("Account Type", selection: $draft.kind) {
                    ForEach(QuickEntryKind.allCases) { kind in
                        Text(kind.label).tag(kind)
                    }
                }
                .pickerStyle(.segmented)
                .controlSize(.regular)
                .padding(.horizontal, 16)
                // Breathing gap to the form below (the VStack spacing is
                // zero so the form meets the calculator flush).
                .padding(.bottom, 8)
                .onChange(of: draft.kind) {
                    // Both sides restart unselected when the scenario
                    // changes.
                    draft.debitAccountId = nil
                    draft.creditAccountId = nil
                    validationError = nil
                    applyExpenseCategoryDefault()
                }
            }

            Form {
                fieldsSection

                if let validationError {
                    Section {
                        Label(validationError, systemImage: "exclamationmark.circle")
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
            }
            // Compact inter-section spacing so the grouped form's cards sit
            // close together. Zeroing the top content margin drops the
            // grouped style's built-in first-section inset, so the fields
            // card sits flush under the tabs. The background matches the
            // form's grouped canvas so the segmented control's translucent
            // chrome picks it up instead of the default white.
            .compactListSectionSpacing()
            // A small top content margin leaves a breathing gap between the
            // pinned tabs and the fields card — zero would sit them flush.
            .contentMargins(.top, 12, for: .scrollContent)

            // Pinned calculator between the form and the sheet's bottom
            // edge: display and keypad combined, always visible, so the
            // amount is typed and adjusted without presenting anything.
            // The pad's check key posts the entry — the sheet's only save
            // control, spinner while posting.
            CalculatorView(
                engine: $engine,
                currency: ledgerStore.activeLedger?.currency,
                onCommit: { Task { await save() } },
                isCommitDisabled: isPosting || draft.isSameAccount,
                isCommitting: isPosting
            )
        }
        // Disables the form and its fields only — attached before the
        // toolbar so Cancel and the ledger switcher stay usable on a
        // read-only ledger (switching away is the escape hatch there).
        .disabled(!canPost)
        .background(Color.cardSurface)
        .navigationTitle(Text(navigationTitleText))
        .inlineNavigationBarTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            // The trailing slot is the ledger switcher, not a save button:
            // the entry's target ledger is picked here while the
            // calculator's check key does the posting.
            ToolbarItem(placement: .confirmationAction) {
                LedgerSwitcherMenu()
            }
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
                members: participantCandidates,
                selection: $draft.participants
            )
        }
        .sheet(isPresented: $isLocationPickerPresented) {
            LocationPickerSheet(initialLocation: draft.location) { place in
                draft.location = place
                draft.isLocationCleared = false
            }
        }
        .overlay {
            if !canPost {
                ContentUnavailableView(
                    "Read-only ledger",
                    systemImage: "lock",
                    description: Text("Editor access or higher is required to post entries.")
                )
            }
        }
        // Keyed by the active ledger so a switcher tap inside the sheet
        // reloads the ledger-scoped stores for the new target.
        .task(id: ledgerStore.activeLedger?.id) {
            guard let ledger = ledgerStore.activeLedger else { return }
            if loadedLedgerId != ledger.id {
                loadedLedgerId = ledger.id
                if editedEntry == nil {
                    // Account, member, and project ids are all
                    // ledger-scoped, so a fresh add drops the previous
                    // ledger's selections; the defaults below re-apply
                    // against the new ledger's data. Edits keep their
                    // draft — the server rejects a cross-ledger update
                    // and the error surfaces in `validationError`.
                    if ledger.isGuest {
                        // Guest ledgers hide the kind picker and are
                        // expense-only, so the kind is forced too — a
                        // kind picked on the previous ledger would
                        // otherwise stick with no way to change it.
                        draft.kind = .expense
                    }
                    draft.debitAccountId = nil
                    draft.creditAccountId = nil
                    draft.participants = []
                    draft.projectId = nil
                    draft.countsInLedger = true
                    draft.location = nil
                    draft.isLocationCleared = false
                    validationError = nil
                }
            }
            await accountStore.load(ledgerId: ledger.id)
            await memberStore.load(ledgerId: ledger.id, myUserId: nil)
            await projectStore.load(ledgerId: ledger.id)
            applyExpenseCategoryDefault()
            applyGuestProjectDefault()
            applyScopedProjectDefault()
        }
        // The switcher inside this sheet can change the scope mid-edit:
        // follow it so a pinned entry never outlives its scope, and an
        // unscoped sheet picks the scope up as soon as one is claimed.
        .onChange(of: scopedProject?.id) {
            applyScopedProjectDefault()
        }
    }

    /// Every field except the amount, in one section: accounts, date,
    /// memo, project, participants.
    @ViewBuilder
    private var fieldsSection: some View {
        Section {
            // The required side leads: for income the category is required
            // and comes first, with the optional "Receive Into" trailing.
            // Guests are expense-only: their "Pay From" side falls back to
            // the ledger's default pocket on the server, so the row is
            // hidden.
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

            DatePicker(
                "Date",
                selection: $draft.date,
                displayedComponents: [.date, .hourAndMinute]
            )

            LabeledContent("Memo") {
                TextField("e.g. weekly groceries", text: $draft.memo)
                    .multilineTextAlignment(.trailing)
                    .submitLabel(.done)
                    .onSubmit { dismissKeyboard() }
            }

            locationField

            if editedEntry == nil, let scopedProject {
                // Project scope pins the entry: read-only row instead of
                // the picker.
                LabeledContent("Project") {
                    Text(scopedProject.name)
                        .foregroundStyle(.secondary)
                }
            } else if !isGuest, !projectStore.projects.isEmpty {
                Picker("Project", selection: Binding(
                    get: { draft.projectId ?? "" },
                    set: { draft.projectId = $0.isEmpty ? nil : $0 }
                )) {
                    Text(L10n.string("projects.none", defaultValue: "No project")).tag("")
                    ForEach(projectStore.projects) { project in
                        Text(project.name).tag(project.id)
                    }
                }
                // Switching the project narrows the participant set to the
                // new project's members — drop any picked participant who
                // isn't in it, or the post would fail validation.
                .onChange(of: draft.projectId) {
                    pruneParticipants()
                }
            }

            // Guests are forced into project scope server-side, so the
            // choice is theirs only on full-role ledgers.
            if !isGuest {
                Toggle(isOn: $draft.countsInLedger) {
                    Text(L10n.string("quick.countsInLedger", defaultValue: "Count in Income & Expense"))
                }
            }

            if !participantCandidates.isEmpty {
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
            }
        }
    }

    /// Optional place of the entry: opens the map picker while empty; once
    /// set, shows the resolved label (tap to re-choose) with a clear button.
    @ViewBuilder
    private var locationField: some View {
        if let location = draft.location {
            LabeledContent {
                HStack(spacing: 8) {
                    Text(locationLabel(location))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Button {
                        // Marks the place for removal: on an edit the
                        // body sends an explicit null, on a fresh post
                        // there was nothing to keep anyway.
                        draft.location = nil
                        draft.isLocationCleared = true
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.borderless)
                }
            } label: {
                Text(
                    L10n.string("quick.location", defaultValue: "Location")
                )
            }
            .contentShape(Rectangle())
            .onTapGesture {
                isLocationPickerPresented = true
            }
        } else {
            Button {
                isLocationPickerPresented = true
            } label: {
                HStack {
                    Text(L10n.string("quick.location.add", defaultValue: "Add Location"))
                    Spacer()
                    Image(systemName: "map")
                        .foregroundStyle(.secondary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    /// Trailing label of the location row: POI name → address → formatted
    /// coordinates, so a geocoding gap never shows a blank value.
    private func locationLabel(_ location: EntryLocationBody) -> String {
        location.rowLabel ?? L10n.string("quick.location.set", defaultValue: "Location set")
    }

    private var canPost: Bool {
        ledgerStore.activeLedger?.canPost ?? false
    }

    // `Text` with a runtime `String` never localizes, so dynamic titles
    // route through `L10n.string` (which honors the in-app language).
    private var navigationTitleText: String {
        editedEntry == nil
            ? L10n.string("Add Entry", defaultValue: "Add Entry")
            : L10n.string("Edit Entry", defaultValue: "Edit Entry")
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
    /// pick the category and the amount. With multiple projects the scoped
    /// default below takes over instead — guests auto-claim the first
    /// project, so the draft is still pinned rather than left unassigned
    /// (validated server-side too).
    private func applyGuestProjectDefault() {
        guard isGuest, draft.projectId == nil, projectStore.projects.count == 1 else { return }
        draft.projectId = projectStore.projects[0].id
    }

    /// A project scoped in the ledger switcher fixes new entries: the draft
    /// follows the scope — live, if it changes while the sheet is open — so
    /// everything recorded under a project scope belongs to that project.
    /// Edits keep the entry's own assignment.
    private func applyScopedProjectDefault() {
        guard editedEntry == nil, let project = scopedProject else { return }
        guard draft.projectId != project.id else { return }
        draft.projectId = project.id
        pruneParticipants()
    }

    /// Drops picked participants who aren't members of the entry's current
    /// project — switching projects must not carry participants across, or
    /// the post fails validation.
    private func pruneParticipants() {
        guard !participantCandidates.isEmpty else {
            draft.participants = []
            return
        }
        let candidateIds = Set(participantCandidates.map(\.id))
        draft.participants.formIntersection(candidateIds)
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

    /// Trailing label of the Participants row: selected names, or a
    /// sentinel — never a blank trailing label. With a project selected,
    /// "none picked" posts the whole project membership at posting time
    /// (the server snapshots it as the split set), so say that instead of
    /// the ledger-wide "Not selected".
    private var participantSummary: String {
        let names = memberStore.members
            .filter { draft.participants.contains($0.id) }
            .map(\.displayName)
        guard !names.isEmpty else {
            if draft.projectId != nil {
                return L10n.string(
                    "quick.participants.allMembers",
                    defaultValue: "All project members"
                )
            }
            return L10n.string("Not selected", defaultValue: "Not selected")
        }
        return names.joined(separator: ", ")
    }

    private func save() async {
        // Settle any pending operation first ("14 + 5" reading 19 posts 19)
        // — there is no keypad sheet dismissal to fold it in anymore.
        engine.commitPending()
        guard let amount = Double(engine.entry), amount > 0 else {
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
