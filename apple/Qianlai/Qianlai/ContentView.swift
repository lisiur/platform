//
//  ContentView.swift
//  Qianlai
//
//  Created by Lisiur Day on 2026/8/26.
//

import SwiftUI

enum AppTab: String, Hashable, Codable {
    case dashboard
    case journal
    case members
    case assets
    case projects
    case reports
    case profile
    /// Never an actual selection — identifies the add pill, whose tap is
    /// intercepted to present the quick-entry sheet instead of navigating.
    case quickAdd

    /// The tab slots the user may show/hide and reorder. Dashboard is
    /// pinned first and profile pinned last, so they are deliberately
    /// absent — a stored arrangement can never move or hide them.
    static let configurableCases: [AppTab] = [.journal, .members, .assets, .projects, .reports]

    var isConfigurable: Bool {
        Self.configurableCases.contains(self)
    }

    var label: LocalizedStringResource {
        switch self {
        case .dashboard:
            LocalizedStringResource(
                "tab.dashboard",
                defaultValue: "Dashboard",
                comment: "Bottom tab: ledger overview (Chinese 仪表盘)"
            )
        case .journal:
            LocalizedStringResource(
                "tab.journal",
                defaultValue: "Journal",
                comment: "Bottom tab: journal entries (Chinese 流水)"
            )
        case .members:
            LocalizedStringResource(
                "tab.members",
                defaultValue: "Members",
                comment: "Bottom tab: active ledger members (Chinese 成员)"
            )
        case .assets:
            LocalizedStringResource(
                "tab.assets",
                defaultValue: "Assets",
                comment: "Bottom tab: real accounts and net worth (Chinese 资产)"
            )
        case .projects:
            LocalizedStringResource(
                "tab.projects",
                defaultValue: "Projects",
                comment: "Bottom tab: projects of the active ledger (Chinese 项目)"
            )
        case .reports:
            LocalizedStringResource(
                "tab.reports",
                defaultValue: "Reports",
                comment: "Bottom tab: ledger reports (Chinese 报表)"
            )
        case .profile:
            LocalizedStringResource(
                "tab.profile",
                defaultValue: "Me",
                comment: "Bottom tab: profile and settings (Chinese 我的)"
            )
        case .quickAdd:
            LocalizedStringResource(
                "tab.add",
                defaultValue: "Add",
                comment: "Bottom tab: quick-entry pill (Chinese 记一笔)"
            )
        }
    }

    var icon: String {
        switch self {
        case .dashboard: "square.grid.2x2"
        case .journal: "list.bullet.rectangle"
        case .members: "person.2"
        case .assets: "creditcard"
        case .projects: "folder"
        case .reports: "chart.pie"
        case .profile: "person.crop.circle"
        case .quickAdd: "plus"
        }
    }
}

struct ContentView: View {
    @Environment(LedgerStore.self) private var ledgerStore
    @Environment(ProjectStore.self) private var projectStore
    @Environment(PreferenceStore.self) private var preferenceStore

    /// The project currently claiming scope on the active ledger, if any.
    private var scopedProject: QianlaiProject? {
        guard let ledger = ledgerStore.activeLedger else { return nil }
        return projectStore.scopedProject(in: ledger.id, isGuestLedger: ledger.isGuest)
    }

    /// The rendered tab list: dashboard pinned first, profile pinned last,
    /// the configurable middle from the user's saved arrangement. Guest
    /// ledgers and project scopes render the fixed four instead — the
    /// arrangement never applies there. The add pill is appended by each
    /// platform's tab bar.
    private var visibleTabs: [AppTab] {
        preferenceStore.visibleTabs(
            isGuest: ledgerStore.activeLedger?.isGuest ?? false,
            isProjectScoped: scopedProject != nil
        )
    }

    var body: some View {
        Group {
            #if os(macOS)
            VStack(spacing: 0) {
                Divider()
                currentTab
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                AppTabBar(selection: tabSelection, tabs: visibleTabs + [.quickAdd])
            }
            #else
            TabView(selection: tabSelection) {
                ForEach(visibleTabs, id: \.self) { tab in
                    Tab(tab.label, systemImage: tab.icon, value: tab) {
                        NavigationStack {
                            tabPage(tab)
                                .modifier(AppTabTitleChrome(tab: tab))
                        }
                    }
                }
                // The quick-entry pill keeps `role: .search` — the only
                // slot iOS 26 reserves with real tab avoidance. Its tap is
                // intercepted in `tabSelection`, which parks the selection
                // on this tab for real at 0.65s (once the cover is opaque)
                // and quietly returns it at 0.7s — the blank content is
                // only "selected" inside that covered window, so nothing
                // ever loads or flashes here. It must stay search-free: a
                // `.searchable` here is what let the search-role tap morph
                // latch onto the drawer search and persist after the sheet
                // closed.
                Tab(
                    AppTab.quickAdd.label,
                    systemImage: AppTab.quickAdd.icon,
                    value: AppTab.quickAdd,
                    role: .search
                ) {
                    Color.clear
                }
            }
            #endif
        }
        .fullScreenCover(isPresented: $isQuickAddPresented) {
            NavigationStack {
                QuickEntryView(binding: quickAddBinding)
            }
            .interactiveDismissDisabled()
        }
        .onChange(of: isQuickAddPresented) { _, presented in
            guard !presented else { return }
            // The sheet is going away: stop the deferred park/return chain
            // and bring the selection home.
            quickAddTransitionTask?.cancel()
            if tab == .quickAdd, quickAddOriginTab != nil {
                // Parked at dismissal: the mirror (the origin page minus
                // its drawer search) stays visible while the cover clears;
                // swap back after the transition so the bar re-mount isn't
                // animated in front of the user.
                unparkTask?.cancel()
                unparkTask = Task {
                    try? await Task.sleep(for: .seconds(0.5))
                    guard !Task.isCancelled else { return }
                    unparkFromQuickAdd()
                }
            } else if quickAddOriginTab != nil {
                // Fast cancel before the deferred park ran: the system's
                // tab bar already parked on the pill at tap. Give it one
                // render pass on the pill to re-sync the highlight, then
                // return to the origin.
                tab = .quickAdd
                unparkTask?.cancel()
                unparkTask = Task {
                    try? await Task.sleep(for: .seconds(0.05))
                    guard !Task.isCancelled else { return }
                    unparkFromQuickAdd()
                }
            }
        }
        .onOpenURL { url in
            // Widget deep links: qianlai://quick-entry opens the quick-entry
            // sheet (a bound widget's link carries its target as query
            // items), qianlai://dashboard lands on the dashboard tab.
            switch url.host {
            case "quick-entry":
                tryPresentQuickAdd(preset: QuickEntryPreset(url: url))
            case "dashboard":
                tab = .dashboard
            default:
                break
            }
        }
        .alert(
            L10n.string("quick.cannotAddTitle", defaultValue: "Can't Add Entry"),
            isPresented: Binding(
                get: { quickAddDeniedReason != nil },
                set: { if !$0 { dismissQuickAddDenial() } }
            )
        ) {
            Button(L10n.string("common.ok", defaultValue: "OK"), role: .cancel) {
                dismissQuickAddDenial()
            }
        } message: {
            Text(quickAddDeniedReason ?? "")
        }
    }

    @State private var tab: AppTab = .dashboard
    @State private var isQuickAddPresented = false
    /// The tab to restore when the quick-entry sheet closes; non-nil only
    /// while the selection is parked on the pill (see `parkOnQuickAdd`).
    @State private var quickAddOriginTab: AppTab?
    /// Deferred park/return chain: parks the selection on the pill once
    /// the cover is opaque, then quietly returns under it (see the
    /// `tabSelection` setter).
    @State private var quickAddTransitionTask: Task<Void, Never>?
    /// Delayed quiet return scheduled once the sheet has covered the
    /// screen: the search-tab exit transition then plays under the opaque
    /// cover instead of on dismissal, where it re-expanded the large
    /// title in plain sight.
    @State private var unparkTask: Task<Void, Never>?
    /// The bound widget's target when the sheet was opened from its deep
    /// link; nil keeps the sheet on the active-ledger defaults. The bound
    /// sheet records against its own ledger — the global scope is untouched.
    @State private var quickAddBinding: QuickEntryBinding?
    /// Set when the quick-add pill is tapped without a postable ledger;
    /// drives the denial alert and clears on dismiss.
    @State private var quickAddDeniedReason: String?

    /// Rejects `.quickAdd` as a *visible* selection: tapping the add tab
    /// parks the selection on the pill (the system insists on completing
    /// its search-tab activation, and fighting it left the bar desynced)
    /// while the sheet is up, then returns to the origin tab on dismissal.
    /// Requires an editable active ledger, matching the floating button it
    /// replaced. The getter also re-seats a selection that a preference
    /// load has just hidden (e.g. synced config from another device) back
    /// to dashboard.
    private var tabSelection: Binding<AppTab> {
        Binding(
            get: { visibleTabs.contains(tab) || tab == .quickAdd ? tab : .dashboard },
            set: { newValue in
                guard newValue != .quickAdd else {
                    // Defer the genuine selection until the cover is fully
                    // opaque: swapping the underlying tab content while it
                    // rises is what flashes the previous page.
                    quickAddOriginTab = visibleTabs.contains(tab) ? tab : .dashboard
                    tryPresentQuickAdd()
                    quickAddTransitionTask?.cancel()
                    quickAddTransitionTask = Task {
                        try? await Task.sleep(for: .seconds(0.65))
                        guard !Task.isCancelled, isQuickAddPresented else { return }
                        parkOnQuickAdd()
                        // Quietly return right after (both writes play
                        // under the opaque cover), so a later dismissal
                        // reveals the real tab with no swap at all.
                        try? await Task.sleep(for: .seconds(0.05))
                        guard !Task.isCancelled, isQuickAddPresented else { return }
                        unparkFromQuickAdd()
                    }
                    return
                }
                quickAddOriginTab = nil
                tab = newValue
            }
        )
    }

    /// Selects the pill for real (SwiftUI and UIKit agree from here on).
    /// The pill's page is the mirror copy of the origin tab, so the parked
    /// state looks normal; `unparkFromQuickAdd` restores the origin.
    private func parkOnQuickAdd() {
        unparkTask?.cancel()
        unparkTask = nil
        quickAddOriginTab = visibleTabs.contains(tab) ? tab : .dashboard
        tab = .quickAdd
    }

    private func unparkFromQuickAdd() {
        if let origin = quickAddOriginTab {
            tab = origin
        }
        quickAddOriginTab = nil
    }

    private func dismissQuickAddDenial() {
        quickAddDeniedReason = nil
        // Denied before the deferred park ran: the system's tab bar parked
        // on the pill at tap — give it one render pass there to re-sync
        // the highlight, then return to the origin.
        if quickAddOriginTab != nil, tab != .quickAdd {
            tab = .quickAdd
            unparkTask?.cancel()
            unparkTask = Task {
                try? await Task.sleep(for: .seconds(0.05))
                guard !Task.isCancelled else { return }
                unparkFromQuickAdd()
            }
            return
        }
        unparkFromQuickAdd()
    }

    /// Presents the quick-entry sheet when the active ledger allows posting;
    /// otherwise surfaces the denial alert. Shared by the add tab's tap
    /// interception and the widget's `qianlai://quick-entry` deep link. A
    /// bound widget's link resolves to its own ledger and the sheet records
    /// against it without touching the global scope. A widget tap is
    /// usually a cold launch, so the ledger list may not be loaded yet —
    /// the load runs and resolution retries before the sheet opens; only a
    /// ledger that still can't be found (deleted) degrades to a plain
    /// quick add.
    private func tryPresentQuickAdd(preset: QuickEntryPreset? = nil) {
        if let preset {
            if let ledger = ledgerStore.ledgers.first(where: { $0.id == preset.ledgerId }) {
                presentQuickAdd(QuickEntryBinding(
                    ledger: ledger,
                    projectId: preset.projectId,
                    categoryId: preset.categoryId,
                    kind: preset.kind
                ))
            } else {
                Task { @MainActor in
                    await ledgerStore.load()
                    if let ledger = ledgerStore.ledgers.first(where: { $0.id == preset.ledgerId }) {
                        presentQuickAdd(QuickEntryBinding(
                            ledger: ledger,
                            projectId: preset.projectId,
                            categoryId: preset.categoryId,
                            kind: preset.kind
                        ))
                    } else {
                        tryPresentQuickAdd()
                    }
                }
            }
            return
        }
        // Plain presentations must never inherit a previous bound target.
        quickAddBinding = nil
        if ledgerStore.activeLedger != nil, ledgerStore.canPost {
            isQuickAddPresented = true
        } else if ledgerStore.activeLedger == nil {
            quickAddDeniedReason = L10n.string("quick.selectLedgerFirst", defaultValue: "Select a ledger first")
        } else {
            quickAddDeniedReason = L10n.string("quick.cannotPost", defaultValue: "You can't add entries in this ledger")
        }
    }

    private func presentQuickAdd(_ binding: QuickEntryBinding) {
        quickAddBinding = binding
        isQuickAddPresented = true
    }

    @ViewBuilder
    private func page(_ tab: AppTab) -> some View {
        switch tab {
        case .dashboard: DashboardView()
        case .journal: JournalView()
        case .members: MembersTabPageView()
        case .assets: RealAccountsView()
        case .projects: ProjectsView()
        case .reports: ReportsView()
        case .profile: ProfileView()
        case .quickAdd: Color.clear
        }
    }

    /// Page content plus the shared toast host. Mounted per-tab (inside the
    /// stack's safe area) so the capsule floats just above the tab bar,
    /// matching Yulai's lightweight toast placement.
    @ViewBuilder
    private func tabPage(_ tab: AppTab) -> some View {
        page(tab)
            .overlay(alignment: .bottom) {
                ToastOverlay()
            }
    }

    private var currentTab: some View {
        NavigationStack {
            tabPage(tab)
                .navigationTitle(Text(tab.label))
        }
    }
}


/// Tab-embedded title chrome: members renders a bare page whose title
/// lives on the tab's navigation bar inline, while the dashboard, journal,
/// profile, and the assets/projects/reports pages set their own large
/// titles internally — those get no extra chrome.
private struct AppTabTitleChrome: ViewModifier {
    let tab: AppTab

    func body(content: Content) -> some View {
        switch tab {
        case .members:
            content
                .navigationTitle(Text(tab.label))
                .inlineNavigationBarTitle()
        case .dashboard, .journal, .assets, .projects, .reports, .profile, .quickAdd:
            content
        }
    }
}

#if os(macOS)
/// WeChat-style bottom tab bar (macOS `TabView` only renders as a top
/// toolbar).
struct AppTabBar: View {
    @Binding var selection: AppTab
    /// The rendered tabs, already preference-ordered; the add pill is
    /// appended by the caller.
    let tabs: [AppTab]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(tabs, id: \.self) { tab in
                Button {
                    selection = tab
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 17))
                        Text(tab.label)
                            .font(.caption2)
                    }
                    .foregroundStyle(
                        selection == tab ? Color.accentColor : Color.secondary
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .background(.bar, ignoresSafeAreaEdges: .bottom)
    }
}
#endif
