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
                if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-location-picker") {
                    LocationPickerSheet(initialLocation: nil) { _ in }
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-category-picker") {
                    CategoryPickerDemo()
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-quick-entry") {
                    QuickEntryDemoScreen()
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-budget-settings") {
                    BudgetSettingsDemoScreen()
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-theme") {
                    // Theme page without login/backend: verifies the 边框高光
                    // section and the background controls offline.
                    BackgroundSettingsView()
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-rim-settings") {
                    // Border highlight sub-page offline harness.
                    NavigationStack { RimSettingsView() }
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-composition-card") {
                    CompositionCardDemo()
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-trend-card") {
                    TrendCardDemo()
                } else if ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-calendar-card") {
                    CalendarCardDemo()
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

/// Screenshot harness for the budget settings page (`--ui-demo-budget-settings`):
/// renders the real `BudgetSettingsView`, whose own `BudgetStore` seeds its
/// settings from the flag; `LedgerStore` seeds the demo CNY ledger so the
/// amounts render with the currency symbol. No login or backend. Adding
/// `--ui-demo-budget-editor` also auto-opens the year-amount editor sheet.
private struct BudgetSettingsDemoScreen: View {
    var body: some View {
        NavigationStack {
            BudgetSettingsView(
                autoOpenEditor: ProcessInfo.processInfo.hasLaunchFlag("--ui-demo-budget-editor")
                    ? .year : nil
            )
        }
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
            row("lunch", name: "午餐", parentCode: "food", cents: 21_000),
            row("breakfast", name: "早餐", parentCode: "food", cents: 12_000),
            row("snacks", name: "零食饮料", parentCode: "food", cents: 8_000),
            row("fuel", name: "加油", parentCode: "transport", cents: 15_000),
            row("subway", name: "地铁公交", parentCode: "transport", cents: 6_000),
            row("utilities", name: "房租水电", parentCode: "housing", cents: 30_000),
            row("digital", name: "数码", cents: 45_000),
            row("refund", name: "退款", parentName: "数码", cents: -2_000),
            row("apparel", name: "衣服鞋帽", cents: 9_900),
            row("topup", name: "话费", cents: 5_000),
            row("voided", name: "撤账", cents: 0),
        ],
        income: [
            row("salary", name: "工资", parentCode: "payroll", cents: 200_000),
            row("interest", name: "理财收益", cents: 50_000),
            row("redpacket", name: "红包", cents: 8_800),
        ]
    )

    private static func row(
        _ accountId: String,
        name: String,
        parentName: String? = nil,
        parentCode: String? = nil,
        cents: Int
    ) -> CategoryAmountRow {
        CategoryAmountRow(
            accountId: accountId,
            name: name,
            code: nil,
            parentName: parentName,
            parentCode: parentCode,
            amountCents: cents
        )
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

/// Screenshot harness for the quick-entry category picker sheet: mirrors the
/// real presentation (`QuickEntryView.activeAccountSide`, large-only detent)
/// with static sample data so sheet styling can be verified without a login
/// or backend. Launch with `--ui-demo-category-picker`.
private struct CategoryPickerDemo: View {
    @State private var isPresented = true
    @State private var selection: String? = "demo-food-dinner"

    var body: some View {
        Color.clear
            .sheet(isPresented: $isPresented) {
                NavigationStack {
                    AccountSelectionView(
                        title: "Category",
                        entries: Self.sampleEntries,
                        allowsEmpty: true,
                        parentSelectable: false,
                        selection: $selection
                    )
                }
                #if os(iOS)
                .presentationDetents([.large])
                #endif
            }
    }

    /// Parent-plus-children expense chart shaped like the seeded data —
    /// enough rows that the sheet grows its search field.
    static let sampleEntries: [AccountTreeEntry] = [
        ("demo-food", "🍜 吃饭", nil),
        ("demo-food-breakfast", "早餐", "demo-food"),
        ("demo-food-lunch", "午餐", "demo-food"),
        ("demo-food-dinner", "晚餐", "demo-food"),
        ("demo-food-snacks", "零食饮料", "demo-food"),
        ("demo-groceries", "🛒 生鲜果蔬", nil),
        ("demo-transport", "🚇 交通", nil),
        ("demo-transport-subway", "地铁公交", "demo-transport"),
        ("demo-transport-taxi", "打车", "demo-transport"),
        ("demo-transport-fuel", "加油", "demo-transport"),
        ("demo-housing", "🏠 居家", nil),
        ("demo-housing-rent", "房租水电", "demo-housing"),
        ("demo-shopping", "🛍️ 购物", nil),
        ("demo-shopping-clothes", "衣服鞋帽", "demo-shopping"),
        ("demo-shopping-digital", "数码", "demo-shopping"),
        ("demo-fun", "🎬 娱乐", nil),
        ("demo-health", "🏥 医疗", nil),
        ("demo-learn", "📚 学习", nil),
    ].map { id, name, parentId in
        AccountTreeEntry(
            account: BookAccount(
                id: id,
                ledgerId: "demo",
                name: name,
                code: nil,
                type: .expense,
                sortOrder: 0,
                parentId: parentId,
                status: "active",
                icon: nil,
                flags: nil,
                meta: nil,
                createdAt: .now
            ),
            depth: parentId == nil ? 0 : 1
        )
    }
}
