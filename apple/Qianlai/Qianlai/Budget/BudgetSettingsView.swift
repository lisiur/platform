//
//  BudgetSettingsView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/15.
//

import SwiftUI

/// The exclusion footer copy, shared by the settings section and the
/// picker sheet — one key, so both surfaces update together.
private func excludedFooterText() -> Text {
    Text(L10n.string(
        "budget.settings.excludedFooter",
        defaultValue: "Entries under an excluded category default to \"exclude from budget\" when recorded — sub-categories can also be excluded on their own. Only future entries are affected."
    ))
}

/// 预算设置 (FR1/FR4) — the ONLY budget configuration surface, reached from
/// the profile's ledger section. Budgets are YEAR-scoped: this page edits
/// the CURRENT year's monthly amount (editors+; the write is ledger-wide
/// shared state), pins single months to their own amounts, and manages the
/// excluded expense categories (any depth). Both amounts edit in a sheet
/// backed by the shared `CalculatorView` — never the system keyboard.
/// Closing the year is the only deletion — single months have no delete
/// path.
struct BudgetSettingsView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ReportStore.self) private var reportStore
    @Environment(ToastCenter.self) private var toast

    @State private var store = BudgetStore()
    @State private var isConfirmingClose = false
    /// The amount the editor sheet is adjusting — the year's monthly
    /// amount or one month's override.
    @State private var amountEditor: AmountEditorTarget?
    /// The editor sheet's calculator engine, re-seeded from the target's
    /// current amount on every open.
    @State private var editorEngine = CalculatorEngine()
    @State private var isEditorSaving = false
    /// The excluded-categories picker sheet.
    @State private var isShowingExcluded = false

    private var ledgerId: String? { ledgerStore.activeLedger?.id }

    /// The settings page edits the current year — budgets are year-scoped.
    private var settingsYear: Int { YearMonth.current.year }

    /// The sheet engine's parsed amount in cents; nil (blank, mid-error)
    /// dims the ✓ key.
    private var editorCents: Int? {
        Self.parseCents(editorEngine.entry)
    }

    var body: some View {
        Form {
            amountSection
            monthsSection
            excludedSection
            if store.settings?.cents != nil {
                closeSection
            }
        }
        .appBackgroundSink()
        .navigationTitle(Text(L10n.string("budget.settings.title", defaultValue: "Budget Settings")))
        .alert(
            L10n.string("budget.closeYear", defaultValue: "Close This Year's Budget"),
            isPresented: $isConfirmingClose
        ) {
            Button(L10n.string("common.cancel", defaultValue: "Cancel"), role: .cancel) {}
            Button(L10n.string("budget.closeYear", defaultValue: "Close This Year's Budget"), role: .destructive) {
                Task { await closeYear() }
            }
        } message: {
            Text(L10n.string(
                "budget.closeYearConfirm",
                defaultValue: "The dashboard budget card disappears until you set this year's budget again. Recorded history is unaffected."
            ))
        }
        .sheet(item: $amountEditor) { target in
            amountEditorSheet(target)
        }
        .sheet(isPresented: $isShowingExcluded) {
            ExcludedCategoriesView(store: store)
        }
        .task {
            guard let ledgerId, loadedLedgerId != ledgerId else { return }
            loadedLedgerId = ledgerId
            await store.load(ledgerId: ledgerId, year: settingsYear)
        }
    }

    @State private var loadedLedgerId: String?

    /// The year's monthly amount, edited in the calculator sheet. The
    /// leading year names the row's scope — budgets are year-scoped and
    /// the sheet's write lands on `settingsYear`.
    private var amountSection: some View {
        Section {
            Button {
                openAmountEditor(.year)
            } label: {
                HStack(spacing: 8) {
                    Text(String(settingsYear))
                        .foregroundStyle(Color.primary)
                    Spacer()
                    if let cents = store.settings?.cents {
                        Text(Money.format(Double(cents) / 100, currency: ledgerStore.activeLedger?.currency))
                            .font(.subheadline.monospacedDigit())
                            .foregroundStyle(Color.primary)
                    } else {
                        Text(L10n.string("budget.settings.amountNone", defaultValue: "Not set"))
                            .font(.subheadline)
                            .foregroundStyle(.tertiary)
                    }
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
            }
            // `.plain` on the three row Buttons: the Form's default
            // borderless style feeds the label an accent foreground and the
            // hierarchical styles (.secondary/.tertiary) resolve AGAINST it —
            // the trailing chevron and the "Adjusted" badge rendered tint.
            // Plain keeps the explicit grays gray (QuickEntryView's rows do
            // the same); the accent amount still reads through the root tint.
            .buttonStyle(.plain)
            .appCardRow()
        } header: {
            Text(L10n.string("budget.monthly", defaultValue: "Monthly Budget"))
        } footer: {
            Text(L10n.string(
                "budget.settings.amountFooter",
                defaultValue: "Applies to every month of this year — including the already-recorded ones."
            ))
        }
    }

    /// 月份调整: every month of the year with its effective amount; tapping
    /// opens the calculator sheet. Disabled until the year has a budget —
    /// an override without a year amount is a state nothing else handles.
    private var monthsSection: some View {
        Section {
            ForEach(1...12, id: \.self) { month in
                Button {
                    openAmountEditor(.month(month))
                } label: {
                    monthRow(month)
                }
                .disabled(store.settings?.cents == nil)
                .buttonStyle(.plain)
                .appCardRow()
            }
        } header: {
            Text(L10n.string("budget.settings.months", defaultValue: "Month Adjustments"))
        } footer: {
            Text(L10n.string(
                "budget.settings.monthsFooter",
                defaultValue: "Pin a month to its own amount. There is no per-month delete — closing this year's budget resets everything."
            ))
        }
    }

    private func monthRow(_ month: Int) -> some View {
        let isAdjusted = store.settings?.monthOverride(month: month) != nil
        return HStack(spacing: 8) {
            Text(AppDates.formatMonthShort(
                YearMonth(year: settingsYear, month: month),
                locale: Locale.current
            ))
            .foregroundStyle(Color.primary)
            if isAdjusted {
                // The pin marker: an adjusted month reads differently from
                // one riding the year's default amount.
                Text(L10n.string("budget.settings.monthAdjusted", defaultValue: "Adjusted"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if let effective = store.settings?.effectiveCents(month: month) {
                Text(Money.format(Double(effective) / 100, currency: ledgerStore.activeLedger?.currency))
                    .font(.subheadline.monospacedDigit())
                    // An adjusted month's amount reads accent — the app's
                    // active-state signal; unadjusted months stay secondary.
                    .foregroundStyle(isAdjusted ? Color.accentColor : .secondary)
            } else {
                Text(L10n.string("budget.settings.excludedNone", defaultValue: "None"))
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
            }
            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
    }

    private var excludedSection: some View {
        Section {
            Button {
                isShowingExcluded = true
            } label: {
                LabeledContent(L10n.string("budget.settings.excluded", defaultValue: "Excluded Categories")) {
                    // Explicit HStack: LabeledContent stacks bare sibling
                    // value views vertically, which would wrap the chevron.
                    HStack(spacing: 8) {
                        Text(excludedCountLabel)
                            .foregroundStyle(.secondary)
                        Image(systemName: "chevron.right")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                }
            }
            .buttonStyle(.plain)
            .appCardRow()
        } footer: {
            excludedFooterText()
        }
    }

    private var excludedCountLabel: String {
        let count = store.settings?.excludedAccountIds.count ?? 0
        return count > 0
            ? String(format: L10n.string("budget.settings.excludedCount", defaultValue: "%d selected"), count)
            : L10n.string("budget.settings.excludedNone", defaultValue: "None")
    }

    private var closeSection: some View {
        Section {
            Button(role: .destructive) {
                isConfirmingClose = true
            } label: {
                Label(L10n.string("budget.closeYear", defaultValue: "Close This Year's Budget"), systemImage: "xmark.circle")
            }
            .appCardRow()
        }
    }

    // MARK: - Amount editor sheet

    /// Which amount the calculator sheet edits.
    enum AmountEditorTarget: Identifiable {
        /// The year's monthly amount.
        case year
        /// One month's override.
        case month(Int)

        var id: String {
            switch self {
            case .year: "year"
            case .month(let month): "month-\(month)"
            }
        }
    }

    /// Seeds the engine from the target's current amount — the year falls
    /// back to last year's carry-over as an editable prefill — and presents
    /// the sheet. The ✓ key commits; Cancel discards. The detent seed is
    /// reset generously so each open measures the target's natural height
    /// (a stale shorter measure would compress the taller sheet and stick).
    private func openAmountEditor(_ target: AmountEditorTarget) {
        let seedCents: Int?
        switch target {
        case .year:
            seedCents = store.settings?.cents ?? store.settings?.carryOverCents
        case .month(let month):
            seedCents = store.settings?.effectiveCents(month: month)
        }
        editorEngine = CalculatorEngine(
            initialText: seedCents.map { String(format: "%.2f", Double($0) / 100) } ?? ""
        )
        editorContentHeight = 440
        amountEditor = target
    }

    /// The sheet hug's live measurements — natural content height and the
    /// chrome above it (top safe area + navigation bar, read as the global
    /// gap between the sheet's top edge and the content's top edge). The
    /// bottom safe area is opted out instead: the pad sinks to the sheet's
    /// bottom edge, quick-entry keypad style, with the home indicator
    /// floating in the pad's own bottom padding. Seeded generously; the
    /// corrections land within the presentation's first frames and keep
    /// the sheet fitted under Dynamic Type.
    @State private var editorContentHeight: CGFloat = 440
    @State private var editorSheetTopY: CGFloat = 0
    @State private var editorContentTopY: CGFloat = 100

    private var editorDetentHeight: CGFloat {
        let chrome = max(0, editorContentTopY - editorSheetTopY)
        return editorContentHeight + chrome
    }

    /// One sheet serves both targets: the system navigation bar (inline
    /// title, Cancel) over the shared `CalculatorView`, the month's
    /// override semantics as a footnote. The sheet HUGS the pad — its
    /// height is measured and fed back as a custom detent, because
    /// `.medium` left a dead band above the calculator.
    private func amountEditorSheet(_ target: AmountEditorTarget) -> some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let footer = editorFooter(target) {
                    footer
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 4)
                }
                CalculatorView(
                    engine: $editorEngine,
                    currency: ledgerStore.activeLedger?.currency ?? "CNY",
                    onCommit: { Task { await commitEditor(target) } },
                    isCommitDisabled: isEditorSaving || editorCents == nil,
                    isCommitting: isEditorSaving
                )
                .padding(.bottom, 8)
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { editorContentHeight = $0 }
            .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY } action: { editorContentTopY = $0 }
            .frame(maxHeight: .infinity, alignment: .top)
            .ignoresSafeArea(.container, edges: .bottom)
            .navigationTitle(editorTitle(target))
            .inlineNavigationBarTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.string("common.cancel", defaultValue: "Cancel")) { amountEditor = nil }
                }
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY } action: { editorSheetTopY = $0 }
        .presentationDetents([.height(editorDetentHeight)])
    }

    private func editorTitle(_ target: AmountEditorTarget) -> Text {
        switch target {
        case .year:
            Text(L10n.string("budget.monthly", defaultValue: "Monthly Budget"))
        case .month(let month):
            Text(AppDates.formatMonthShort(
                YearMonth(year: settingsYear, month: month),
                locale: Locale.current
            ))
        }
    }

    /// The month sheet carries its override semantics; the year sheet needs
    /// none — the page's section footer already explains the amount.
    private func editorFooter(_ target: AmountEditorTarget) -> Text? {
        guard case .month = target else { return nil }
        return Text(L10n.string(
            "budget.settings.monthEditorFooter",
            defaultValue: "Applies to this month only; the year's amount still covers every other month."
        ))
    }

    /// The ✓ key's write: folds any pending operation first, so the total
    /// the display previewed is what gets kept, then dispatches on the
    /// target. Failure keeps the sheet up with the entry intact — a retry
    /// is one tap.
    private func commitEditor(_ target: AmountEditorTarget) async {
        guard let ledgerId else {
            amountEditor = nil
            return
        }
        editorEngine.commitPending()
        guard let cents = Self.parseCents(editorEngine.entry) else { return }
        isEditorSaving = true
        defer { isEditorSaving = false }
        do {
            switch target {
            case .year:
                _ = try await store.setYear(ledgerId: ledgerId, year: settingsYear, cents: cents)
            case .month(let month):
                _ = try await store.setMonth(ledgerId: ledgerId, year: settingsYear, month: month, cents: cents)
            }
            amountEditor = nil
            toast.show(L10n.string("budget.saved", defaultValue: "Budget saved"))
            await reportStore.refreshBudget()
        } catch {
            toast.show(error.localizedDescription)
        }
    }

    // MARK: - Actions

    private func closeYear() async {
        guard let ledgerId else { return }
        do {
            _ = try await store.closeYear(ledgerId: ledgerId, year: settingsYear)
            toast.show(L10n.string("budget.closed", defaultValue: "Budget closed"))
            await reportStore.refreshBudget()
        } catch {
            toast.show(error.localizedDescription)
        }
    }

    private static func parseCents(_ text: String) -> Int? {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, let value = Double(trimmed), value >= 0 else { return nil }
        let cents = Int((value * 100).rounded())
        return cents <= 999_999_999_999 ? cents : nil
    }
}

/// The excluded-categories picker (FR4), a sheet off the budget settings:
/// multi-select over the ledger's expense categories at ANY depth — a
/// sub-category can be excluded on its own, and descendants ride an
/// excluded ancestor (those rows render checked in secondary and are
/// inert; the posting-time walk has no re-include marker). Toggles edit a
/// local pending set and Done commits ONE full-replacement write;
/// swiping the sheet away discards (the participants sheet's model). Per
/// tap commits raced the seed for real: the seed's overwrite landed
/// between the first tap and its task, and the task then sent the
/// replacement without that selection.
struct ExcludedCategoriesView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ReportStore.self) private var reportStore
    @Environment(ToastCenter.self) private var toast

    let store: BudgetStore

    @State private var accountStore = AccountStore()
    @State private var pending: Set<String> = []
    @State private var isSaving = false
    @State private var loadedLedgerId: String?

    private var ledgerId: String? { ledgerStore.activeLedger?.id }

    /// The full expense tree in select order — parents first, children
    /// indented after them, archived filtered out.
    private var categories: [AccountTreeEntry] {
        AccountTreeEntry.build(accountStore.byType(.expense))
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    // One id→account index per render — the per-row
                    // ancestor walks share it instead of rebuilding it.
                    let entries = categories
                    let byId = Dictionary(
                        uniqueKeysWithValues: entries.map { ($0.account.id, $0.account) }
                    )
                    ForEach(entries) { entry in
                        excludedRow(
                            entry,
                            isInherited: !pending.contains(entry.account.id)
                                && BudgetMath.chain(
                                    from: entry.account.id,
                                    byId: byId,
                                    contains: pending,
                                    includingSelf: false
                                )
                        )
                    }
                } footer: {
                    excludedFooterText()
                }
            }
            .navigationTitle(Text(L10n.string("budget.settings.excluded", defaultValue: "Excluded Categories")))
            .inlineNavigationBarTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(
                        isSaving
                            ? L10n.string("common.saving", defaultValue: "Saving…")
                            : L10n.string("common.done", defaultValue: "Done")
                    ) {
                        Task { await commit() }
                    }
                    .disabled(isSaving)
                }
            }
        }
        .presentationDetents([.large])
        .task {
            guard let ledgerId, loadedLedgerId != ledgerId else { return }
            loadedLedgerId = ledgerId
            // Seed pending BEFORE loading accounts: rows can't be tapped
            // before they render, so the seed can never clobber a tap (it
            // ran after the await and wiped exactly the first selection).
            // Fetch the settings here too if the settings page's own load
            // lost the race with this sheet, so the seed never starts from
            // a phantom-empty list.
            if store.settings == nil {
                await store.load(ledgerId: ledgerId, year: YearMonth.current.year)
            }
            pending = Set(store.settings?.excludedAccountIds ?? [])
            await accountStore.load(ledgerId: ledgerId)
        }
    }

    /// Manage-screen tree anatomy: depth insets (`12 + depth * 18`), name
    /// weighted by depth, trailing checkmark — accent when the row is
    /// picked on its own, secondary when it rides an excluded ancestor.
    private func excludedRow(_ entry: AccountTreeEntry, isInherited: Bool) -> some View {
        let isExplicit = pending.contains(entry.account.id)
        return Button {
            toggle(entry.account.id)
        } label: {
            HStack(spacing: 12) {
                Text(entry.account.icon ?? entry.account.type.defaultIcon)
                    .font(.title3)
                Text(entry.account.displayName)
                    .fontWeight(entry.account.parentId == nil ? .medium : .regular)
                    .foregroundStyle(Color.primary)
                Spacer()
                if isExplicit || isInherited {
                    Image(systemName: "checkmark")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(isExplicit ? Color.accentColor : Color.secondary)
                }
            }
        }
        .disabled(isInherited)
        .listRowInsets(EdgeInsets(top: 6, leading: 12 + CGFloat(entry.depth) * 18, bottom: 6, trailing: 12))
        .appCardRow()
    }

    /// Local flip only — nothing hits the network until Done.
    private func toggle(_ id: String) {
        if pending.contains(id) {
            pending.remove(id)
        } else {
            pending.insert(id)
        }
    }

    /// The one network write: a full replacement of the exclusion list
    /// with the pending set as of Done. Failure keeps the sheet up with
    /// the selection intact, so a retry is one tap away.
    private func commit() async {
        guard let ledgerId else {
            dismiss()
            return
        }
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await store.setExcludedCategories(
                ledgerId: ledgerId,
                year: YearMonth.current.year,
                accountIds: pending.sorted()
            )
            await reportStore.refreshBudget()
            dismiss()
        } catch {
            toast.show(error.localizedDescription)
        }
    }
}
