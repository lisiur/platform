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
/// excluded expense categories (any depth). Closing the year is the only
/// deletion — single months have no delete path.
struct BudgetSettingsView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ReportStore.self) private var reportStore
    @Environment(ToastCenter.self) private var toast

    @State private var store = BudgetStore()
    @State private var amountText = ""
    @State private var isSaving = false
    @State private var isConfirmingClose = false
    /// The month whose amount the editor sheet is adjusting.
    @State private var monthEditor: MonthEditor?
    /// The excluded-categories picker sheet.
    @State private var isShowingExcluded = false

    private var ledgerId: String? { ledgerStore.activeLedger?.id }

    /// The settings page edits the current year — budgets are year-scoped.
    private var settingsYear: Int { YearMonth.current.year }

    /// The parsed year-amount field in cents; nil (invalid) disables Save.
    private var parsedCents: Int? {
        Self.parseCents(amountText)
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
        .appBackgroundCanvas()
        .navigationTitle(Text(L10n.string("budget.settings.title", defaultValue: "Budget Settings")))
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(isSaving ? L10n.string("common.saving", defaultValue: "Saving…") : L10n.string("common.save", defaultValue: "Save")) {
                    Task { await save() }
                }
                .disabled(isSaving || parsedCents == nil || ledgerId == nil)
            }
        }
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
        .sheet(item: $monthEditor) { editor in
            monthEditorSheet(editor)
        }
        .sheet(isPresented: $isShowingExcluded) {
            ExcludedCategoriesView(store: store)
        }
        .task {
            guard let ledgerId, loadedLedgerId != ledgerId else { return }
            loadedLedgerId = ledgerId
            await store.load(ledgerId: ledgerId, year: settingsYear)
            seedAmountText()
        }
    }

    @State private var loadedLedgerId: String?

    private var amountSection: some View {
        Section {
            HStack(spacing: 8) {
                Text(Money.symbol(for: ledgerStore.activeLedger?.currency ?? "CNY"))
                    .foregroundStyle(.secondary)
                TextField(
                    L10n.string("budget.amount.placeholder", defaultValue: "Monthly amount"),
                    text: $amountText
                )
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
            }
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
    /// opens the amount editor. Disabled until the year has a budget — an
    /// override without a year amount is a state nothing else handles.
    private var monthsSection: some View {
        Section {
            ForEach(1...12, id: \.self) { month in
                Button {
                    openMonthEditor(month)
                } label: {
                    monthRow(month)
                }
                .disabled(store.settings?.cents == nil)
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
        HStack(spacing: 8) {
            Text(AppDates.formatMonthShort(
                YearMonth(year: settingsYear, month: month),
                locale: Locale.current
            ))
            .foregroundStyle(Color.primary)
            if store.settings?.monthOverride(month: month) != nil {
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
                    .foregroundStyle(.secondary)
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

    // MARK: - Month editor sheet

    struct MonthEditor: Identifiable {
        let month: Int
        var id: Int { month }
    }

    private func openMonthEditor(_ month: Int) {
        let seed = store.settings?.effectiveCents(month: month)
        monthEditor = MonthEditor(month: month)
        monthEditorText = seed.map { String(format: "%.2f", Double($0) / 100) } ?? ""
    }

    @State private var monthEditorText = ""

    private func monthEditorSheet(_ editor: MonthEditor) -> some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 8) {
                        Text(Money.symbol(for: ledgerStore.activeLedger?.currency ?? "CNY"))
                            .foregroundStyle(.secondary)
                        TextField(
                            L10n.string("budget.amount.placeholder", defaultValue: "Monthly amount"),
                            text: $monthEditorText
                        )
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                    }
                } footer: {
                    Text(L10n.string(
                        "budget.settings.monthEditorFooter",
                        defaultValue: "Applies to this month only; the year's amount still covers every other month."
                    ))
                }
            }
            .navigationTitle(Text(AppDates.formatMonthShort(
                YearMonth(year: settingsYear, month: editor.month),
                locale: Locale.current
            )))
            .inlineNavigationBarTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.string("common.cancel", defaultValue: "Cancel")) { monthEditor = nil }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.string("common.save", defaultValue: "Save")) {
                        Task { await saveMonth(editor.month) }
                    }
                    .disabled(Self.parseCents(monthEditorText) == nil)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func saveMonth(_ month: Int) async {
        guard let ledgerId, let cents = Self.parseCents(monthEditorText) else { return }
        do {
            _ = try await store.setMonth(
                ledgerId: ledgerId, year: settingsYear, month: month, cents: cents
            )
            monthEditor = nil
            toast.show(L10n.string("budget.saved", defaultValue: "Budget saved"))
            await reportStore.refreshBudget()
        } catch {
            toast.show(error.localizedDescription)
        }
    }

    // MARK: - Actions

    /// Seeds the field: the year's current amount, else the previous
    /// year's carry-over as an unsaved prefill.
    private func seedAmountText() {
        if let cents = store.settings?.cents {
            amountText = String(format: "%.2f", Double(cents) / 100)
        } else if let carryOver = store.settings?.carryOverCents {
            amountText = String(format: "%.2f", Double(carryOver) / 100)
        }
    }

    private func save() async {
        guard let ledgerId, let cents = parsedCents else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await store.setYear(ledgerId: ledgerId, year: settingsYear, cents: cents)
            toast.show(L10n.string("budget.saved", defaultValue: "Budget saved"))
            await reportStore.refreshBudget()
        } catch {
            toast.show(error.localizedDescription)
        }
    }

    private func closeYear() async {
        guard let ledgerId else { return }
        do {
            _ = try await store.closeYear(ledgerId: ledgerId, year: settingsYear)
            amountText = ""
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
