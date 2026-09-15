//
//  BudgetSettingsView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/15.
//

import SwiftUI

/// 预算设置 (FR1/FR4) — the ONLY budget configuration surface, reached from
/// the profile's ledger section. Budgets are YEAR-scoped: this page edits
/// the CURRENT year's monthly amount (editors+; the write is ledger-wide
/// shared state), pins single months to their own amounts, and manages the
/// excluded top-level categories. Closing the year is the only deletion —
/// single months have no delete path.
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
            NavigationLink {
                ExcludedCategoriesView(store: store)
            } label: {
                LabeledContent(L10n.string("budget.settings.excluded", defaultValue: "Excluded Categories")) {
                    Text(excludedCountLabel)
                        .foregroundStyle(.secondary)
                }
            }
        } footer: {
            Text(L10n.string(
                "budget.settings.excludedFooter",
                defaultValue: "Entries under an excluded top-level category default to \"exclude from budget\" when recorded. Only future entries are affected."
            ))
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

/// The excluded-categories picker (FR4): multi-select over the ledger's
/// TOP-LEVEL expense categories; children inherit their parent's exclusion
/// at posting time. Unlike the sheet-pickers, this page commits per tap
/// (pushed customization surfaces persist on change, like the chip sheet),
/// so leaving never loses a selection.
struct ExcludedCategoriesView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ReportStore.self) private var reportStore
    @Environment(ToastCenter.self) private var toast

    let store: BudgetStore

    @State private var accountStore = AccountStore()
    @State private var pending: Set<String> = []
    @State private var loadedLedgerId: String?

    private var ledgerId: String? { ledgerStore.activeLedger?.id }

    /// The tree's top level, expense type only — the exclusion unit.
    private var topLevelCategories: [AccountTreeEntry] {
        AccountTreeEntry.build(accountStore.byType(.expense))
            .filter { $0.depth == 0 }
    }

    var body: some View {
        List {
            Section {
                ForEach(topLevelCategories) { entry in
                    Button {
                        toggle(entry.account.id)
                    } label: {
                        HStack(spacing: 12) {
                            Text(entry.account.icon ?? entry.account.type.defaultIcon)
                                .font(.title3)
                            Text(entry.account.displayName)
                                .foregroundStyle(Color.primary)
                            Spacer()
                            if pending.contains(entry.account.id) {
                                Image(systemName: "checkmark")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Color.accentColor)
                            }
                        }
                    }
                    .appCardRow()
                }
            } footer: {
                Text(L10n.string(
                    "budget.settings.excludedFooter",
                    defaultValue: "Entries under an excluded top-level category default to \"exclude from budget\" when recorded. Only future entries are affected."
                ))
            }
        }
        .appBackgroundCanvas()
        .navigationTitle(Text(L10n.string("budget.settings.excluded", defaultValue: "Excluded Categories")))
        .task {
            guard let ledgerId, loadedLedgerId != ledgerId else { return }
            loadedLedgerId = ledgerId
            await accountStore.load(ledgerId: ledgerId)
            // Seeding from a settings payload that never loaded would make
            // the first toggle commit a full replacement built around an
            // empty list — fetch it here if the settings page's own load
            // lost the race with this push.
            if store.settings == nil {
                await store.load(ledgerId: ledgerId, year: YearMonth.current.year)
            }
            pending = Set(store.settings?.excludedAccountIds ?? [])
        }
    }

    private func toggle(_ id: String) {
        guard let ledgerId else { return }
        // Optimistic flip with rollback — same persistence shape as the
        // chip customization sheet's toggles.
        let wasSelected = pending.contains(id)
        if wasSelected {
            pending.remove(id)
        } else {
            pending.insert(id)
        }
        Task {
            do {
                _ = try await store.setExcludedCategories(
                    ledgerId: ledgerId,
                    year: YearMonth.current.year,
                    accountIds: pending.sorted()
                )
                await reportStore.refreshBudget()
            } catch {
                if wasSelected {
                    pending.insert(id)
                } else {
                    pending.remove(id)
                }
                toast.show(error.localizedDescription)
            }
        }
    }
}
