//
//  WidgetData.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/9/5.
//

import Foundation

/// Cross-process plumbing for the widget extension: the App Group suite
/// both the app and the widget read/write, and the keychain access group
/// that lets the widget read the session token the app stores.
nonisolated enum WidgetAppGroup {
    static let suiteName = "group.top.hapaul.qianlai"

    /// Keychain access group shared by the app and the widget. The team-id
    /// prefix must match DEVELOPMENT_TEAM in the project; entitlements carry
    /// the same group via `$(AppIdentifierPrefix)`. Keychain sharing is an
    /// iOS-style concept — macOS keychains have no access groups and don't
    /// host the widget, so other platforms store without one.
    #if os(iOS) || os(xrOS)
    static let keychainAccessGroup: String? = "V45ATZDSXQ.top.hapaul.qianlai.shared"
    #else
    static let keychainAccessGroup: String? = nil
    #endif

    /// The shared suite, or nil when the App Group entitlement is missing
    /// (e.g. a mis-provisioned build) — callers degrade to no widget data.
    static var defaults: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }
}

/// One recent entry flattened for widget rendering — the widget process has
/// no view code in common with the app, so each entry carries its resolved
/// display values (category title, emoji badge, money flow) instead of the
/// full double-entry `JournalEntry`.
nonisolated struct WidgetRecentEntry: Codable, Hashable, Identifiable {
    enum Flow: String, Codable, Hashable {
        case expense
        case income
        case transfer
    }

    let id: String
    let date: Date
    let title: String
    /// The category account's emoji; nil falls back to a flow symbol.
    let icon: String?
    let flow: Flow
    /// Gross entry amount (sum of debits), same base the app's rows use.
    let value: Double
    /// Display name of the leaf account's parent category (e.g. "Food"),
    /// when the leaf sits under one. Mirrors the secondary caption the
    /// app's `EntryRow` shows next to sub-category titles so the widget
    /// disambiguates same-named leaves under different parents. Optional
    /// so snapshots written before the parent join shipped still decode —
    /// the missing field is treated as no parent context.
    let parentName: String?

    init(
        id: String,
        date: Date,
        title: String,
        icon: String?,
        flow: Flow,
        value: Double,
        parentName: String? = nil
    ) {
        self.id = id
        self.date = date
        self.title = title
        self.icon = icon
        self.flow = flow
        self.value = value
        self.parentName = parentName
    }

    /// Resolves the display values the same way the app's `EntryRow` does:
    /// the expense category line wins over income, and a category-less
    /// entry is a transfer.
    @MainActor
    init(entry: JournalEntry) {
        let categoryLine = entry.lines.first { $0.account.type == .expense }
            ?? entry.lines.first { $0.account.type == .income }
        let flow: Flow = {
            switch categoryLine?.account.type {
            case .expense: .expense
            case .income: .income
            default: .transfer
            }
        }()
        let parentName = categoryLine?.account.parent?.displayName
        self.init(
            id: entry.id,
            date: entry.date,
            title: categoryLine?.account.displayName
                ?? L10n.string("quick.kind.transfer", defaultValue: "Transfer"),
            icon: categoryLine?.account.icon,
            flow: flow,
            value: entry.amount,
            parentName: (parentName?.isEmpty ?? true) ? nil : parentName
        )
    }
}

/// The widget-shaped slice of a ledger's dashboard: current-month totals
/// and a few recent entries. Built by the app after each dashboard load
/// (and by the widget after each successful fetch) so the widget can
/// render its last-known numbers when the network is down.
nonisolated struct WidgetSnapshot: Codable, Hashable {
    let ledgerId: String
    let monthYear: Int
    let monthMonth: Int
    let totalIncome: Double
    let totalExpense: Double
    let net: Double
    let recentEntries: [WidgetRecentEntry]
    let generatedAt: Date

    init(
        ledgerId: String,
        monthYear: Int,
        monthMonth: Int,
        totalIncome: Double,
        totalExpense: Double,
        net: Double,
        recentEntries: [WidgetRecentEntry],
        generatedAt: Date
    ) {
        self.ledgerId = ledgerId
        self.monthYear = monthYear
        self.monthMonth = monthMonth
        self.totalIncome = totalIncome
        self.totalExpense = totalExpense
        self.net = net
        self.recentEntries = recentEntries
        self.generatedAt = generatedAt
    }

    /// MainActor because flattening entries resolves localized titles
    /// through `L10n`. Callers are the app's `ReportStore` and the widget's
    /// load path, both main-actor.
    ///
    /// `month` is the local month the dashboard window covered — the server
    /// echoes its window's `from` instant in UTC terms, which lands in the
    /// previous month for timezones east of UTC, so the label must never
    /// come from `dashboard.month`.
    @MainActor
    init(ledgerId: String, dashboard: Dashboard, month: YearMonth) {
        self.ledgerId = ledgerId
        monthYear = month.year
        monthMonth = month.month
        totalIncome = dashboard.month.totalIncome
        totalExpense = dashboard.month.totalExpense
        net = dashboard.month.net
        recentEntries = dashboard.recentEntries.prefix(5).map(WidgetRecentEntry.init(entry:))
        generatedAt = Date()
    }

    var month: YearMonth {
        YearMonth(year: monthYear, month: monthMonth)
    }
}

/// The project currently claiming scope in the ledger switcher, mirrored
/// for the widgets: its name labels the quick-add tile and the summary
/// widget's project mode, its ids drive the project-report fetch.
nonisolated struct WidgetScopedProject: Codable, Hashable {
    let id: String
    let ledgerId: String
    let name: String
}

/// The project-scoped counterpart of `WidgetSnapshot`: a project has no
/// balance sheet, so its widget surfaces the statement totals.
nonisolated struct WidgetProjectSnapshot: Codable, Hashable {
    let projectId: String
    let name: String
    let totalIncome: Double
    let totalExpense: Double
    let net: Double
    let recentEntries: [WidgetRecentEntry]
    let generatedAt: Date

    init(project: WidgetScopedProject, statement: IncomeStatement, recentEntries: [WidgetRecentEntry]) {
        projectId = project.id
        name = project.name
        totalIncome = statement.totalIncome
        totalExpense = statement.totalExpense
        net = statement.net
        self.recentEntries = recentEntries
        generatedAt = Date()
    }

    /// Offline fallback built from the report alone (no recent entries) —
    /// the widget's own fetches fill those in.
    init(project: WidgetScopedProject, report: ProjectReport) {
        self.init(project: project, statement: report.statement, recentEntries: [])
    }
}

/// Shared-suite persistence for the widget, in the `RecentCategoryStore`
/// style: a stateless enum with injectable defaults so tests can use their
/// own suite. The app mirrors the active-ledger choice and publishes
/// dashboard snapshots here; the widget reads them and (when it fetches
/// successfully) republishes the snapshot itself.
nonisolated enum WidgetDataStore {
    /// The GUEST-FREE active-ledger id for the widget — the resolution of
    /// `resolveWidgetLedger`, never a ledger the viewer only guests in.
    /// Distinct from `appActiveLedgerIdKey`, which holds the app's raw
    /// active-ledger context.
    static let activeLedgerIdKey = "qianlai.activeLedgerId"
    /// JSON-encoded `QianlaiLedger` for the active ledger — lets the widget
    /// resolve name/currency without a network round-trip.
    static let activeLedgerKey = "widget.activeLedger"
    /// JSON-encoded `WidgetSnapshot`, the offline fallback.
    static let snapshotKey = "widget.snapshot"
    /// JSON-encoded `WidgetProjectSnapshot`, the project-mode fallback.
    static let projectSnapshotKey = "widget.projectSnapshot"
    /// The project claiming quick-entry/dashboard scope — the explicit
    /// selection, or the auto-picked first project on guest ledgers. The
    /// summary and quick-add widgets surface this scope's name (and, for
    /// the summary, its totals); nil means ledger-wide.
    static let scopedProjectKey = "widget.scopedProject"

    static func loadActiveLedgerId(defaults: UserDefaults? = WidgetAppGroup.defaults) -> String? {
        defaults?.string(forKey: activeLedgerIdKey)
    }

    static func saveActiveLedgerId(_ id: String?, defaults: UserDefaults? = WidgetAppGroup.defaults) {
        defaults?.set(id, forKey: activeLedgerIdKey)
    }

    static func loadActiveLedger(defaults: UserDefaults? = WidgetAppGroup.defaults) -> QianlaiLedger? {
        guard
            let data = defaults?.data(forKey: activeLedgerKey),
            let ledger = try? JSONDecoder().decode(QianlaiLedger.self, from: data)
        else { return nil }
        return ledger
    }

    static func saveActiveLedger(_ ledger: QianlaiLedger?, defaults: UserDefaults? = WidgetAppGroup.defaults) {
        guard let ledger, let data = try? JSONEncoder().encode(ledger) else {
            defaults?.removeObject(forKey: activeLedgerKey)
            return
        }
        defaults?.set(data, forKey: activeLedgerKey)
    }

    static func loadScopedProject(defaults: UserDefaults? = WidgetAppGroup.defaults) -> WidgetScopedProject? {
        guard
            let data = defaults?.data(forKey: scopedProjectKey),
            let project = try? JSONDecoder().decode(WidgetScopedProject.self, from: data)
        else { return nil }
        return project
    }

    static func saveScopedProject(_ project: WidgetScopedProject?, defaults: UserDefaults? = WidgetAppGroup.defaults) {
        guard let project, let data = try? JSONEncoder().encode(project) else {
            defaults?.removeObject(forKey: scopedProjectKey)
            return
        }
        defaults?.set(data, forKey: scopedProjectKey)
    }

    static func loadSnapshot(defaults: UserDefaults? = WidgetAppGroup.defaults) -> WidgetSnapshot? {
        guard
            let data = defaults?.data(forKey: snapshotKey),
            let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
        else { return nil }
        return snapshot
    }

    static func saveSnapshot(_ snapshot: WidgetSnapshot, defaults: UserDefaults? = WidgetAppGroup.defaults) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults?.set(data, forKey: snapshotKey)
    }

    static func loadProjectSnapshot(defaults: UserDefaults? = WidgetAppGroup.defaults) -> WidgetProjectSnapshot? {
        guard
            let data = defaults?.data(forKey: projectSnapshotKey),
            let snapshot = try? JSONDecoder().decode(WidgetProjectSnapshot.self, from: data)
        else { return nil }
        return snapshot
    }

    static func saveProjectSnapshot(_ snapshot: WidgetProjectSnapshot, defaults: UserDefaults? = WidgetAppGroup.defaults) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults?.set(data, forKey: projectSnapshotKey)
    }

    /// Sign-out cleanup: the widget has nothing to show without a session.
    static func clearAll(defaults: UserDefaults? = WidgetAppGroup.defaults) {
        defaults?.removeObject(forKey: activeLedgerIdKey)
        defaults?.removeObject(forKey: activeLedgerKey)
        defaults?.removeObject(forKey: snapshotKey)
        defaults?.removeObject(forKey: scopedProjectKey)
        defaults?.removeObject(forKey: projectSnapshotKey)
        defaults?.removeObject(forKey: appActiveLedgerIdKey)
        defaults?.removeObject(forKey: appActiveLedgerIsGuestKey)
    }

    /// The active-ledger fallback chain shared with `LedgerStore.activeLedger`:
    /// the stored choice when still valid, else the default active ledger,
    /// else the first active one, else anything (archived included — it is
    /// read-only but still shows real numbers).
    static func resolveActiveLedger(
        from ledgers: [QianlaiLedger],
        storedId: String?
    ) -> QianlaiLedger? {
        resolveFallbackChain(candidates: ledgers, storedId: storedId)
    }

    /// The widget-facing variant of `resolveActiveLedger`: ledgers where the
    /// viewer is only a guest are skipped everywhere — a guest can see
    /// neither the owner's ledger name nor any statistic, so the widget must
    /// never resolve to one. Their data surfaces through the scoped-project
    /// mirror instead. A stored id pointing at a guest or archived ledger is
    /// treated as invalid and falls through the chain.
    static func resolveWidgetLedger(
        from ledgers: [QianlaiLedger],
        storedId: String?
    ) -> QianlaiLedger? {
        resolveFallbackChain(candidates: ledgers.filter { !$0.isGuest }, storedId: storedId)
    }

    /// The chain both resolvers share: the stored choice when still valid —
    /// existing AND active, so a ledger archived elsewhere never
    /// re-activates from a persisted id — then the default active ledger,
    /// the first active one, and finally anything at all.
    private static func resolveFallbackChain(
        candidates: [QianlaiLedger],
        storedId: String?
    ) -> QianlaiLedger? {
        candidates.first { $0.id == storedId && $0.isActive }
            ?? candidates.first { $0.isDefault && $0.isActive }
            ?? candidates.first { $0.isActive }
            ?? candidates.first
    }

    /// Keys describing the APP's raw active-ledger context. Only the app
    /// process writes them; both suites' consumers read the shared one (the
    /// widget's standard defaults are empty) — the scoped-project mirror
    /// needs the raw active ledger, including guest ledgers, while
    /// `widget.activeLedger` above holds the guest-free resolution. This key
    /// must stay distinct from `activeLedgerIdKey`: both live in the shared
    /// suite, and the raw write would clobber the guest-free one.
    static let appActiveLedgerIdKey = "widget.appActiveLedgerId"
    static let appActiveLedgerIsGuestKey = "widget.appActiveLedgerIsGuest"

    static func loadAppActiveLedgerId(defaults: UserDefaults? = WidgetAppGroup.defaults) -> String? {
        defaults?.string(forKey: appActiveLedgerIdKey)
    }

    /// Read from the shared suite: the app writes the flag there, and the
    /// widget process (whose standard defaults are empty) needs it too.
    static func loadAppActiveLedgerIsGuest(defaults: UserDefaults? = WidgetAppGroup.defaults) -> Bool {
        defaults?.bool(forKey: appActiveLedgerIsGuestKey) ?? false
    }
}
