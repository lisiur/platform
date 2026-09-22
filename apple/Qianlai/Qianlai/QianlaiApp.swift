//
//  QianlaiApp.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

@main
struct QianlaiApp: App {
    @State private var authManager: AuthManager
    @State private var ledgerStore: LedgerStore
    @State private var realAccountStore: RealAccountStore
    @State private var journalStore = JournalStore()
    @State private var reportStore = ReportStore()
    @State private var projectStore = ProjectStore()
    @State private var preferenceStore = PreferenceStore()
    @State private var backgroundSettings = BackgroundSettings()
    @State private var appearanceSettings = AppearanceSettings()
    @State private var accentSettings = AccentSettings()
    @State private var rimSettings = RimSettings()
    @State private var toast: ToastCenter
    @State private var localeSettings = LocaleSettings.shared

    init() {
        let authManager = AuthManager()
        self.authManager = authManager
        self.ledgerStore = LedgerStore()
        self.realAccountStore = RealAccountStore()
        self.toast = ToastCenter()
    }

    var body: some Scene {
        WindowGroup(id: "main") {
            Group {
                if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-quick-entry") {
                    QuickEntryDemoScreen()
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-theme") {
                    // Theme page without login/backend: verifies the 边框高光
                    // section and the background controls offline. The page
                    // is a sink consumer now, so the harness carries the
                    // sunk shell it clears against.
                    AppBackgroundSinkContainer {
                        NavigationStack { BackgroundSettingsView() }
                    }
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-wallpaper-tabs") {
                    WallpaperTabsDemo()
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-rim-settings") {
                    // Border highlight sub-page offline harness.
                    NavigationStack { RimSettingsView() }
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-composition-card") {
                    CompositionCardDemo()
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-icon-badge") {
                    IconBadgeDemo()
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-trend-card") {
                    TrendCardDemo()
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-calendar-card") {
                    CalendarCardDemo()
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-range-card") {
                    RangeCardDemo()
                } else if authManager.isLoggedIn {
                    // First-login guide: self-registered users (flag still
                    // set) see onboarding instead of the main tabs.
                    if authManager.isOnboardingPending {
                        OnboardingView()
                    } else {
                        ContentView()
                    }
                } else if authManager.isRestoringSession {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    LoginView()
                }
            }
            .environment(authManager)
            .environment(ledgerStore)
            .environment(realAccountStore)
            .environment(journalStore)
            .environment(reportStore)
            .environment(projectStore)
            .environment(preferenceStore)
            .environment(backgroundSettings)
            .environment(appearanceSettings)
            .environment(accentSettings)
            .environment(rimSettings)
            .environment(toast)
            .environment(localeSettings)
            .environment(\.locale, localeSettings.preferredLocale)
            // Theme page's appearance override: nil follows the system.
            .preferredColorScheme(appearanceSettings.appearance.colorScheme)
            // Theme page's accent override; every Color.accentColor in the
            // hierarchy resolves through this environment.
            .tint(accentSettings.accent.color)
            // The widget renders with the mirrored accent on its next
            // refresh; nudge it so the switch shows up promptly.
            .onChange(of: accentSettings.accent) {
                WidgetSync.reloadTimelines()
            }
            // The widget renders with the mirrored language override on its
            // next refresh; nudge it so the switch shows up promptly.
            .onChange(of: localeSettings.identifier) {
                WidgetSync.reloadTimelines()
            }
            #if os(macOS)
            .frame(minWidth: 640, minHeight: 640)
            #endif
            .task {
                await authManager.restoreSession()
            }
            .task(id: authManager.isLoggedIn) {
                // Ledgers load once per login; the switcher and views refresh
                // from there. Preferences load alongside — the tab bar
                // renders the cached arrangement instantly and the fetch
                // only corrects it when the config changed elsewhere.
                if authManager.isLoggedIn {
                    await ledgerStore.load()
                    await preferenceStore.load()
                }
            }
        }
        #if os(macOS)
        .windowResizability(.contentMinSize)
        #endif
    }
}

/// Screenshot-harness launch flags (`--ui-demo-*`) gate demo rendering at
/// runtime — one door for the stringly-typed checks.
extension ProcessInfo {
    func hasLaunchFlag(_ flag: String) -> Bool {
        arguments.contains(flag)
    }
}

/// Screenshot harness for the quick-entry sheet itself (`AccountStore` seeds
/// its sample chart when this launch argument is set): renders the real
/// `QuickEntryView` in bound mode — owner role, no ledger switcher — so the
/// kind tabs, category grid, chip bar, and calculator lay out without a
/// login or backend. Launch with `--ui-demo-quick-entry`.
private struct QuickEntryDemoScreen: View {
    var body: some View {
        NavigationStack {
            QuickEntryView(binding: QuickEntryBinding(ledger: Self.demoLedger))
        }
    }

    static let demoLedger: QianlaiLedger = {
        // Two recent categories so the recents row renders above the grid.
        for id in ["demo-learn", "demo-food"] {
            RecentCategoryStore.record(id, ledgerId: "demo-ledger", kind: .expense)
        }
        return QianlaiLedger(
        id: "demo-ledger",
        ownerId: "demo-owner",
        name: "演示账本",
        description: nil,
        currency: "CNY",
        status: "active",
        isDefault: true,
        createdAt: .now,
        updatedAt: .now,
        myRole: .owner,
        membersCount: 1,
        shared: false
        )
    }()
}

/// Screenshot harness for the sunk-wallpaper tab shell
/// (`--ui-demo-wallpaper-tabs`, add `--ui-demo-wallpaper-off` to compare
/// against the wallpaper disabled): replicates ContentView's iOS branch —
/// TabView → Tab → AppBackgroundSinkContainer → NavigationStack → a
/// large-title page with a trailing toolbar item — with the wallpaper
/// force-enabled (the first preset auto-applies when the active slot is
/// empty, mirroring `setEnabled`). No login or backend; vehicle for the
/// toolbar/status-bar overlap.
private struct WallpaperTabsDemo: View {
    @Environment(BackgroundSettings.self) private var backgroundSettings
    @State private var tab: WallpaperDemoTab = .ledger

    var body: some View {
        TabView(selection: $tab) {
            ForEach(WallpaperDemoTab.allCases) { demoTab in
                Tab(demoTab.label, systemImage: demoTab.icon, value: demoTab) {
                    AppBackgroundSinkContainer {
                        NavigationStack {
                            WallpaperDemoPage(title: demoTab.label)
                        }
                    }
                }
            }
        }
        .task {
            if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-wallpaper-off") {
                try? backgroundSettings.setEnabled(false)
            } else if !backgroundSettings.isActive {
                try? backgroundSettings.setEnabled(true)
            }
        }
    }
}

private enum WallpaperDemoTab: String, CaseIterable, Identifiable {
    case ledger, stats, profile

    var id: String { rawValue }

    var label: String {
        switch self {
        case .ledger: "账本"
        case .stats: "统计"
        case .profile: "我的"
        }
    }

    var icon: String {
        switch self {
        case .ledger: "book"
        case .stats: "chart.pie"
        case .profile: "person.crop.circle"
        }
    }
}

/// Stand-in root page: large title + trailing toolbar item over a grouped
/// list — the chrome whose position against the status bar is under test.
private struct WallpaperDemoPage: View {
    let title: String

    var body: some View {
        List {
            ForEach(0..<40, id: \.self) { index in
                // verbatim: demo filler must not feed the string catalog's
                // build-time extraction (it seeded an empty stub key).
                Text(verbatim: "演示行 \(index + 1)")
            }
        }
        .appBackgroundSink()
        .navigationTitle(Text(title))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
    }
}

/// Shared chrome for the two chart-card demos: the card top-anchored on
/// a padded full canvas.
private struct ChartCardDemoCanvas<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 16) {
            content
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

/// Screenshot harness for the dashboard's composition card
/// (`--ui-demo-composition-card`, add `--ui-demo-composition-all` to pin
/// the 全部 leaf view; the card defaults to the 一级分类 rollup): a
/// month-shaped category summary with a parent tree, a top-level leaf,
/// and offsetting/zero rows — enough slices to exercise the leader
/// lines' per-side stacking and the rollup. The card's own pickers
/// switch side/level live. No login or backend.
private struct CompositionCardDemo: View {
    var body: some View {
        ChartCardDemoCanvas {
            CategoryBreakdownCard(
                summary: Self.summary,
                currency: "CNY",
                locale: Locale(identifier: "zh-Hans"),
                initialLevel: ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-composition-all")
                    ? .leaf : .parent
            )
        }
    }

    static let summary = CategorySummaryResponse(
        expense: [
            row("lunch", name: "午餐", parentCode: "food", icon: "🍱", parentIcon: "🍜", cents: 21_000),
            row("breakfast", name: "早餐", parentCode: "food", icon: "🥣", parentIcon: "🍜", cents: 12_000),
            row("snacks", name: "零食饮料", parentCode: "food", icon: "🥤", parentIcon: "🍜", cents: 8_000),
            row("fuel", name: "加油", parentCode: "transport", icon: "⛽️", parentIcon: "🚗", cents: 15_000),
            row("subway", name: "地铁公交", parentCode: "transport", icon: "🚇", parentIcon: "🚗", cents: 6_000),
            row("utilities", name: "房租水电", parentCode: "housing", icon: "💡", parentIcon: "🏠", cents: 30_000),
            row("digital", name: "数码", icon: "💻", cents: 45_000),
            row("refund", name: "退款", parentName: "数码", icon: "🔄", parentIcon: "💻", cents: -2_000),
            row("apparel", name: "衣服鞋帽", icon: "👕", cents: 9_900),
            row("topup", name: "话费", icon: "📱", cents: 5_000),
            row("voided", name: "撤账", cents: 0),
        ],
        income: [
            row("salary", name: "工资", parentCode: "payroll", icon: "💰", parentIcon: "💼", cents: 200_000),
            row("interest", name: "理财收益", icon: "📈", cents: 50_000),
            row("redpacket", name: "红包", icon: "🧧", cents: 8_800),
        ]
    )

    private static func row(
        _ accountId: String,
        name: String,
        parentName: String? = nil,
        parentCode: String? = nil,
        icon: String? = nil,
        parentIcon: String? = nil,
        cents: Int
    ) -> CategoryAmountRow {
        CategoryAmountRow(
            accountId: accountId,
            name: name,
            code: nil,
            parentName: parentName,
            parentCode: parentCode,
            parentIcon: parentIcon,
            icon: icon,
            amountCents: cents
        )
    }
}

/// Screenshot harness for the shared category icon badge
/// (`--ui-demo-icon-badge`): one anatomy at three diameters — the journal
/// card's 36pt, an in-between 28pt, and the composition legend's 20pt —
/// each showing a parent-overlaid leaf, a bare leaf, and the unset-icon
/// fallback, so the proportional scaling is visible side by side. No
/// login or backend; emoji are verbatim sample glyphs, not catalog keys.
private struct IconBadgeDemo: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 32) {
            presetRow("36pt · 流水卡", diameter: 36)
            presetRow("28pt · 中间档", diameter: 28)
            presetRow("20pt · 图例", diameter: 20)
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    @ViewBuilder
    private func presetRow(_ title: String, diameter: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(verbatim: title)
                .font(.footnote)
                .foregroundStyle(.secondary)
            HStack(alignment: .bottom, spacing: 28) {
                CategoryIconBadge(
                    icon: "🍱",
                    fallbackSymbol: "arrow.down.circle.fill",
                    parentIcon: "🍜",
                    diameter: diameter
                )
                CategoryIconBadge(
                    icon: "🥤",
                    fallbackSymbol: "arrow.down.circle.fill",
                    parentIcon: "🍜",
                    diameter: diameter
                )
                CategoryIconBadge(
                    icon: "💻",
                    fallbackSymbol: "arrow.down.circle.fill",
                    parentIcon: nil,
                    diameter: diameter
                )
                CategoryIconBadge(
                    icon: nil,
                    fallbackSymbol: "arrow.down.circle.fill",
                    parentIcon: nil,
                    diameter: diameter
                )
            }
        }
    }
}

/// Screenshot harness for the stats component's trend card
/// (`--ui-demo-trend-card`; add `--ui-demo-trend-income` /
/// `--ui-demo-trend-net` to pin the 收入 / 结余 tab instead of the
/// default 支出): a month of daily totals with an income spike and mostly
/// income-free days, so the net tab's sign coloring (红涨绿跌) shows at a
/// glance. The card's own tab and style picker switch live. No login or
/// backend.
private struct TrendCardDemo: View {
    var body: some View {
        ChartCardDemoCanvas {
            TrendChartCard(
                days: Self.days,
                window: Self.window,
                currency: "CNY",
                locale: Locale(identifier: "zh-Hans"),
                initialMetric: ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-trend-income")
                    ? .income
                    : ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-trend-net") ? .net : .expense
            )
        }
    }

    /// The current month as the demo's window — day keys derive from it,
    /// so the chart stays populated in any month.
    static let month = AppDates.currentYearMonth
    static var window: MonthWindow { AppDates.monthWindow(containing: month.start) }

    static let days: [DayIncomeExpense] = (1...30).map { day in
        // Income spikes ~9x the daily expense band: on the shared
        // both-sides scale they crush the expense bars into slivers, so
        // the single-series re-aim is visible at a glance.
        let incomeCents = [3, 13, 23].contains(day) ? 180_000 : ([7, 17, 27].contains(day) ? 12_000 : 0)
        let expenseCents = 8_000 + (day * 37 % 190) * 1_000
        return DayIncomeExpense(
            day: String(format: "%04d-%02d-%02d", month.year, month.month, day),
            incomeCents: incomeCents,
            expenseCents: expenseCents
        )
    }
}

/// Screenshot harness for the dashboard's month calendar card
/// (`--ui-demo-calendar-card`): the CURRENT month's grid — so the 农历
/// labels and today's accent dot render against real dates — with an
/// expense most days, an income-only day (the −0 expense placeholder),
/// a six-figure income day (the 万 compact), and one absent day (lunar
/// label plus blank income slot). No login or backend.
private struct CalendarCardDemo: View {
    var body: some View {
        ChartCardDemoCanvas {
            MonthCalendarCard(
                days: Self.days,
                month: AppDates.currentYearMonth,
                locale: Locale(identifier: "zh-Hans")
            )
        }
    }

    static let days: [DayIncomeExpense] = (1...28).filter { $0 != 21 }.map { day in
        DayIncomeExpense(
            day: String(
                format: "%04d-%02d-%02d",
                AppDates.currentYearMonth.year, AppDates.currentYearMonth.month, day
            ),
            incomeCents: day == 5 ? 1_280_000 : (day == 15 ? 9_900 : 0),
            expenseCents: day == 15 ? 0 : 8_000 + (day * 37 % 190) * 1_000
        )
    }
}

/// Screenshot harness for the dashboard's today/week/year card and the
/// summary-to-list gap (`--ui-demo-range-card`): the summary as the
/// EntryListView topContent row renders it — month title + range card
/// under the same listRow modifiers — followed by two day sections with
/// headers and card rows, so the gap and the card's bottom-corner
/// masking measure against real list metrics. The summary stacks through
/// the same `dashboardSummaryStack` chrome the real page uses (minus the
/// budget/stats cards). No login or backend.
private struct RangeCardDemo: View {
    @State private var rangeStore = RangeTotalsStore(days: RangeCardDemo.days)

    var body: some View {
        NavigationStack {
            List {
                summary
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                ForEach(0..<2, id: \.self) { day in
                    Section {
                        ForEach(0..<2, id: \.self) { row in
                            entryRow(day: day, row: row)
                                .appCardRow()
                        }
                    } header: {
                        dayHeader(day)
                    }
                }
            }
            .appBackgroundSink()
            .navigationTitle(Text(verbatim: "演示账本"))
        }
    }

    private var summary: some View {
        dashboardSummaryStack(title: AppDates.formatMonthTitle(.current, locale: Self.locale)) {
            RangeTotalsCard(
                store: rangeStore,
                currency: "CNY",
                locale: Self.locale
            )
            .summaryCardGap()
        }
    }

    private func dayHeader(_ day: Int) -> some View {
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                Text(verbatim: "9月\(day + 1)日")
                Text(verbatim: "周\(["一", "二", "三", "四"][day])")
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 12)
            // The section's rows sum, so the filler figures agree.
            Text(verbatim: "−¥\(day * 20 + 25).00")
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(Color.expense)
        }
    }

    private func entryRow(day: Int, row: Int) -> some View {
        HStack(spacing: 10) {
            Text(verbatim: "🍜 餐饮 · 示例\(day + 1)-\(row + 1)")
                .font(.subheadline.weight(.semibold))
            Spacer()
            Text(verbatim: "−¥\(day * 10 + row + 12).00")
                .font(.callout.weight(.semibold).monospacedDigit())
                .foregroundStyle(Color.expense)
        }
    }

    private static let locale = Locale(identifier: "zh-Hans")

    /// Twenty days back from today so the 今天/本周/本年 rows all carry
    /// non-zero figures (the year row needs pre-month days).
    static let days: [DayIncomeExpense] = {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        return (0..<20).map { offset in
            let day = calendar.date(byAdding: .day, value: -offset, to: today)
                ?? today
            let components = calendar.dateComponents([.year, .month, .day], from: day)
            return DayIncomeExpense(
                day: String(
                    format: "%04d-%02d-%02d",
                    components.year ?? 0, components.month ?? 0, components.day ?? 0
                ),
                incomeCents: offset % 4 == 0 ? 128_000 : 0,
                expenseCents: 8_600 + offset * 3_700
            )
        }
    }()
}

