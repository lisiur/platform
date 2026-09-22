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
                defaultValue: "Ledger",
                comment: "Bottom tab: ledger overview (Chinese 账本)"
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
        case .dashboard: "text.book.closed"
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
                AppTabBar(
                    selection: tabSelection,
                    tabs: visibleTabs + [.quickAdd],
                    pillLongPress: { tryPresentRecognition() }
                )
            }
            #else
            // The sunk wallpaper lives at the TAB level: each tab wraps its
            // NavigationStack in AppBackgroundSinkContainer (see there for
            // why the layer can sit neither under the whole TabView nor
            // inside the stack). Pages opt in with appBackgroundSink.
            // Covers (quick entry) and macOS still use the per-page canvas.
            TabView(selection: tabSelection) {
                ForEach(visibleTabs, id: \.self) { tab in
                    Tab(tab.label, systemImage: tab.icon, value: tab) {
                        AppBackgroundSinkContainer {
                            NavigationStack {
                                page(tab)
                                    .modifier(AppTabTitleChrome(tab: tab))
                                    .background(QuickAddTabBarIntrospection(proxy: quickAddTabBarProxy))
                            }
                        }
                        .modifier(ToastHostModifier())
                    }
                }
                // The quick-entry pill's role is version-split: iOS 26
                // reserves the trailing capsule for `role: .search` (the
                // only slot with real tab avoidance), while iOS 27 stopped
                // granting search tabs that capsule — there a plain
                // `.search` pill merges into the main capsule even with
                // only two tabs (2026-09-16 probe on the 27.0 GM runtime),
                // and `role: .prominent` (new in 27) is what keeps it
                // separated. Both gestures are refused one layer down, at
                // the UITabBarControllerDelegate (QuickAddTabBarProxy): the
                // tap presents quick entry, a ~0.5 s hold presents the
                // screenshot-recognition cover, and the pill never becomes
                // selected, so this page never mounts and no park/resync
                // choreography is needed on either OS.
                // It must stay search-free: a `.searchable` here is what
                // let the iOS 26 search-role tap morph latch onto the
                // drawer search and persist after the sheet closed.
                Tab(
                    AppTab.quickAdd.label,
                    systemImage: AppTab.quickAdd.icon,
                    value: AppTab.quickAdd,
                    role: quickAddTabRole
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
        .screenshotRecognitionCover(
            isPresented: $isRecognitionPresented,
            seed: $recognitionResult
        )
        .onAppear {
            quickAddTabBarProxy.pillTapped = { tryPresentQuickAdd() }
            quickAddTabBarProxy.pillLongPressed = { tryPresentRecognition() }
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
                get: { entryDeniedReason != nil },
                set: { if !$0 { dismissEntryDenial() } }
            )
        ) {
            Button(L10n.string("common.ok", defaultValue: "OK"), role: .cancel) {
                dismissEntryDenial()
            }
        } message: {
            Text(entryDeniedReason ?? "")
        }
    }

    @State private var tab: AppTab = .dashboard
    @State private var isQuickAddPresented = false
    /// The pill's long-press destination — the screenshot-recognition
    /// ("视图记账") cover, whose only entry this pill now is (the Journal
    /// toolbar button was retired when the gesture shipped).
    @State private var isRecognitionPresented = false
    /// The recognition produced inside the recognition cover: non-nil swaps
    /// that cover's content to the seeded quick entry (the result surface IS
    /// the quick entry). One cover hosts both phases — no dismiss-then-present
    /// chain, which raced the quick entry's seed and presented it plain.
    /// Cleared when the cover finally dismisses.
    @State private var recognitionResult: ScreenshotRecognition?
    /// The UIKit-level tap/long-press interception for the pill (see
    /// QuickAddTabBarProxy). The proxy object must live as long as the
    /// screen — the tab bar controller holds it as its delegate.
    @State private var quickAddTabBarProxy = QuickAddTabBarProxy()
    /// The bound widget's target when the sheet was opened from its deep
    /// link; nil keeps the sheet on the active-ledger defaults. The bound
    /// sheet records against its own ledger — the global scope is untouched.
    @State private var quickAddBinding: QuickEntryBinding?
    /// Set when the quick-add pill is used without a postable ledger;
    /// drives the denial alert and clears on dismiss.
    @State private var entryDeniedReason: String?

    /// The pill's role, version-split for the trailing capsule — the full
    /// story lives in the TabView comment. Availability-guarded because
    /// `TabRole.prominent` doesn't exist below 27.
    private var quickAddTabRole: TabRole {
        if #available(iOS 27.0, *) {
            return .prominent
        }
        return .search
    }

    /// Pill taps are normally refused at the UIKit layer
    /// (QuickAddTabBarProxy returns false from the tab bar controller
    /// delegate, so the pill never becomes selected and its blank page
    /// never mounts) and this binding only ever sees real tabs. The
    /// `.quickAdd` branch is the degraded fallback for if that
    /// interception ever fails to install: present the sheet, but never
    /// write the pill into the selection — the getter keeps re-asserting
    /// the origin tab, so the blank page can't strand the user. Requires
    /// an editable active ledger, matching the floating button it
    /// replaced. The getter also re-seats a selection that a preference
    /// load has just hidden (e.g. synced config from another device) back
    /// to dashboard.
    private var tabSelection: Binding<AppTab> {
        Binding(
            get: { visibleTabs.contains(tab) || tab == .quickAdd ? tab : .dashboard },
            set: { newValue in
                guard newValue != .quickAdd else {
                    tryPresentQuickAdd()
                    return
                }
                tab = newValue
            }
        )
    }

    private func dismissEntryDenial() {
        entryDeniedReason = nil
    }

    /// Presents the quick-entry sheet when the active ledger allows posting;
    /// otherwise surfaces the denial alert. Shared by the add tab's tap
    /// interception and the widget's `qianlai://quick-entry` deep link. A
    /// bound widget's link resolves to its own ledger and the sheet records
    /// against it without touching the global scope. A widget tap is
    /// usually a cold launch, and the deep link is delivered the moment
    /// this view mounts — before the app-level ledger fetch settles — so
    /// an empty `activeLedger` there means "no data yet", not "no
    /// ledgers". Both paths therefore run the load and re-resolve before
    /// denying: a bound target that still can't be found (deleted)
    /// degrades to a plain quick add, and the plain path below only
    /// surfaces a denial once a load has actually settled.
    private func tryPresentQuickAdd(preset: QuickEntryPreset? = nil) {
        if let preset {
            resolveBoundQuickAdd(preset)
            return
        }
        // Plain presentations must never inherit a previous bound target.
        quickAddBinding = nil
        if ledgerStore.activeLedger != nil, ledgerStore.canPost {
            isQuickAddPresented = true
            return
        }
        // The not-yet-loaded empty list is "no data yet", not "no ledgers"
        // (see above): a cold-launch link beats the startup fetch. Load and
        // re-enter — only the settled pass below may deny.
        guard ledgerStore.hasLoaded else {
            Task { @MainActor in
                await ledgerStore.load()
                tryPresentQuickAdd()
            }
            return
        }
        if ledgerStore.activeLedger == nil {
            entryDeniedReason = L10n.string("quick.selectLedgerFirst", defaultValue: "Select a ledger first")
        } else {
            entryDeniedReason = L10n.string("quick.cannotPost", defaultValue: "You can't add entries in this ledger")
        }
    }

    /// Presents the screenshot-recognition ("视图记账") cover when the
    /// active ledger allows it: full-role ledgers with posting rights
    /// only — guests are project-pinned expense loggers the recognition
    /// prefill doesn't cover, and viewers can't post (the gate the
    /// retired Journal toolbar button applied). Anything else falls back
    /// to the tap action, so a long press never dead-ends: a guest or
    /// post-locked ledger gets the regular quick-add flow (which surfaces
    /// its own denial alert).
    private func tryPresentRecognition() {
        if ledgerStore.activeLedger?.canRecognizeScreenshots == true {
            isRecognitionPresented = true
            return
        }
        tryPresentQuickAdd()
    }

    private func presentQuickAdd(_ binding: QuickEntryBinding) {
        quickAddBinding = binding
        isQuickAddPresented = true
    }

    /// Presents the bound widget's sheet against its target ledger. The
    /// target must be an ACTIVE ledger — an archived one refuses every
    /// write server-side, and falling through to the plain path would
    /// silently record into a different ledger than the tile names. A
    /// cold launch delivers the link before the ledger fetch settles, so
    /// a miss runs the load once and re-resolves; a target that still
    /// doesn't exist (deleted) degrades to a plain quick add.
    private func resolveBoundQuickAdd(_ preset: QuickEntryPreset) {
        if let ledger = boundTargetLedger(preset) {
            presentOrDenyBound(ledger, preset)
            return
        }
        Task { @MainActor in
            await ledgerStore.load()
            guard let ledger = boundTargetLedger(preset) else {
                tryPresentQuickAdd()
                return
            }
            presentOrDenyBound(ledger, preset)
        }
    }

    private func boundTargetLedger(_ preset: QuickEntryPreset) -> QianlaiLedger? {
        ledgerStore.ledgers.first { $0.id == preset.ledgerId }
    }

    private func presentOrDenyBound(_ ledger: QianlaiLedger, _ preset: QuickEntryPreset) {
        guard ledger.isActive else {
            entryDeniedReason = L10n.string(
                "quick.cannotPost",
                defaultValue: "You can't add entries in this ledger"
            )
            return
        }
        presentQuickAdd(QuickEntryBinding(
            ledger: ledger,
            projectId: preset.projectId,
            categoryId: preset.categoryId,
            kind: preset.kind
        ))
    }

    @ViewBuilder
    private func page(_ tab: AppTab) -> some View {
        switch tab {
        case .dashboard: DashboardView()
        case .journal: JournalView()
        case .members: MembersTabPageView().appBackgroundSink()
        case .assets: RealAccountsView()
        case .projects: ProjectsView()
        case .reports: ReportsView()
        case .profile: ProfileView()
        case .quickAdd: Color.clear
        }
    }

    private var currentTab: some View {
        NavigationStack {
            page(tab)
                .navigationTitle(Text(tab.label))
        }
        .modifier(ToastHostModifier())
    }
}


/// The toast host wraps a tab's whole NavigationStack, not its root page:
/// a push takes the root (and any overlay on it) out of the appeared
/// subtrees, which used to hold toasts raised on pushed pages (e.g.
/// category create) until the next page switch. The stack container
/// itself never disappears on push, so the capsule shows immediately.
/// Shared by both platforms' tab hosts (the iOS TabView loop and the
/// macOS custom bar's current-tab view).
private struct ToastHostModifier: ViewModifier {
    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            ToastOverlay()
        }
    }
}


/// Tab-embedded title chrome: members renders a bare page whose title is
/// supplied here (the tab's empty state mounts no view that sets one),
/// while the dashboard, journal, profile, and the assets/projects/reports
/// pages set their own large titles internally — those get no extra chrome.
private struct AppTabTitleChrome: ViewModifier {
    let tab: AppTab

    func body(content: Content) -> some View {
        switch tab {
        case .members:
            content
                .navigationTitle(Text(tab.label))
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
    /// Runs when the add pill is long-pressed (~0.5 s) — screenshot
    /// recognition, matching the iOS pill. The high-priority gesture wins
    /// the hold; a quick lift fails it and the plain Button tap fires.
    var pillLongPress: (() -> Void)?

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
                .modifier(PillLongPressModifier(
                    isEnabled: tab == .quickAdd && pillLongPress != nil
                ) {
                    pillLongPress?()
                })
            }
        }
        .background(.bar, ignoresSafeAreaEdges: .bottom)
    }
}

private struct PillLongPressModifier: ViewModifier {
    let isEnabled: Bool
    let action: () -> Void

    func body(content: Content) -> some View {
        if isEnabled {
            content.highPriorityGesture(
                LongPressGesture(minimumDuration: 0.5)
                    .onEnded { _ in action() }
            )
        } else {
            content
        }
    }
}
#endif
