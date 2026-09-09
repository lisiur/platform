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
                if ProcessInfo.processInfo.arguments.contains("--ui-demo-location-picker") {
                    LocationPickerSheet(initialLocation: nil) { _ in }
                } else if ProcessInfo.processInfo.arguments.contains("--ui-demo-category-picker") {
                    CategoryPickerDemo()
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
            .environment(toast)
            .environment(localeSettings)
            .environment(\.locale, localeSettings.preferredLocale)
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
